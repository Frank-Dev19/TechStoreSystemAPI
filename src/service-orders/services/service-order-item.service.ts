import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DeepPartial, In, IsNull, Not, Repository } from 'typeorm';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItemEvent } from '../entities/service-order-item-event.entity';
import { TechnicianAssignmentBalance } from '../entities/technician-assignment-balance.entity';
import { CreateServiceOrderItemDto } from '../dto/create-service-order-item.dto';
import { ServiceOrderItemStatus, ServiceOrderStatus, ServiceType } from '../enums';
import { canTransitionServiceOrderItem } from '../state-machines/service-order-item.state-machine';
import { User } from '../../users/entities/user.entity';
import { hasRoleName, TECHNICIAN_ROLE_NAMES } from '../../common/constants/role-names';

type FindServiceOrderItemsQuery = {
  page?: number | string;
  limit?: number | string;
  status?: string;
  serviceOrderId?: number | string;
  technicianId?: number | string;
  assignedToMe?: string;
  withDeleted?: string;
  search?: string;
};

type TechnicianTypeBalance = {
  assignedCount: number;
  activeCount: number;
  lastAssignedAt: Date | null;
};

type TechnicianAssignmentSnapshot = {
  technicianId: number;
  totalActiveCount: number;
  byType: Map<ServiceType, TechnicianTypeBalance>;
};

@Injectable()
export class ServiceOrderItemService {
  private readonly logger = new Logger(ServiceOrderItemService.name);

  private readonly terminalItemStatuses = [
    ServiceOrderItemStatus.DELIVERED,
    ServiceOrderItemStatus.CANCELLED,
    ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT,
  ];

  constructor(
    @InjectRepository(ServiceOrderItem)
    private readonly serviceOrderItemRepository: Repository<ServiceOrderItem>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderItemEvent)
    private readonly serviceOrderItemEventRepository: Repository<ServiceOrderItemEvent>,
    @InjectRepository(TechnicianAssignmentBalance)
    private readonly technicianAssignmentBalanceRepository: Repository<TechnicianAssignmentBalance>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async createItemsWithAutoAssignment(
    dtos: CreateServiceOrderItemDto[],
    startingNumber: number,
    now: Date,
  ): Promise<ServiceOrderItem[]> {
    if (!dtos?.length) {
      return [];
    }

    const technicianSnapshot = await this.prepareTechnicianAssignmentSnapshot();

    return dtos.map((dto, index) => {
      const technicianId = this.pickTechnicianId(
        technicianSnapshot,
        dto.serviceType ?? ServiceType.DIAGNOSIS,
        now,
      );
      return this.buildServiceOrderItem(dto, startingNumber + index + 1, now, technicianId);
    });
  }

  async registerAutoAssignments(items: ServiceOrderItem[]): Promise<void> {
    if (!items.length) {
      return;
    }

    await Promise.all(
      items
        .filter((item) => typeof item.assignedToTechnicianId === 'number')
        .map((item) =>
          this.adjustTechnicianBalance(
            item.assignedToTechnicianId!,
            item.serviceType,
            1,
            1,
            item.assignedAt ?? new Date(),
          ),
        ),
    );
  }

  private buildServiceOrderItem(
    dto: CreateServiceOrderItemDto,
    itemNumber: number,
    now: Date,
    technicianId?: number,
  ): ServiceOrderItem {
    const partial: DeepPartial<ServiceOrderItem> = {
      itemNumber,
      equipmentType: dto.equipmentType,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      serialNumber: dto.serialNumber ?? null,
      initialIssue: dto.initialIssue,
      accessories: dto.accessories ?? null,
      serviceType: dto.serviceType ?? ServiceType.DIAGNOSIS,
      estimatedRepairHours: dto.estimatedRepairHours ?? null,
      receivedAt: now,
      assignedToTechnicianId: technicianId ?? null,
      assignedAt: technicianId ? now : null,
      status: ServiceOrderItemStatus.ASSIGNED,
    };

    return this.serviceOrderItemRepository.create(partial);
  }

  applyAggregates(serviceOrder: ServiceOrder): void {
    const items = serviceOrder.items ?? [];
    const activeItems = items.filter((item) => !item.deletedAt);

    serviceOrder.itemsCount = activeItems.length;
    serviceOrder.completedItemsCount = activeItems.filter((item) =>
      this.terminalItemStatuses.includes(item.status),
    ).length;

    if (!activeItems.length) {
      serviceOrder.status = ServiceOrderStatus.CANCELLED;
      return;
    }

    if (activeItems.every((item) => item.status === ServiceOrderItemStatus.CANCELLED)) {
      serviceOrder.status = ServiceOrderStatus.CANCELLED;
      return;
    }

    if (
      activeItems.every((item) =>
        [ServiceOrderItemStatus.CANCELLED, ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT].includes(item.status),
      )
    ) {
      serviceOrder.status = ServiceOrderStatus.CANCELLED;
      return;
    }

    if (activeItems.every((item) => this.terminalItemStatuses.includes(item.status))) {
      serviceOrder.status = ServiceOrderStatus.COMPLETED;
      return;
    }

    if (activeItems.some((item) => this.terminalItemStatuses.includes(item.status))) {
      serviceOrder.status = ServiceOrderStatus.PARTIALLY_COMPLETED;
      return;
    }

    if (activeItems.some((item) => item.status !== ServiceOrderItemStatus.ASSIGNED)) {
      serviceOrder.status = ServiceOrderStatus.IN_PROGRESS;
      return;
    }

    serviceOrder.status = ServiceOrderStatus.OPEN;
  }

  async findAll(query: FindServiceOrderItemsQuery, currentUserId?: number) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';
    const statuses = this.parseEnumList<ServiceOrderItemStatus>(query.status, ServiceOrderItemStatus, 'status');

    const qb = this.serviceOrderItemRepository
      .createQueryBuilder('serviceOrderItem')
      .leftJoinAndSelect('serviceOrderItem.serviceOrder', 'serviceOrder')
      .leftJoinAndSelect('serviceOrderItem.assignedTechnician', 'assignedTechnician');

    if (includeDeleted) {
      qb.withDeleted();
    }

    if (statuses?.length) {
      qb.andWhere('serviceOrderItem.status IN (:...statuses)', { statuses });
    }

    if (query.serviceOrderId !== undefined) {
      const serviceOrderId = this.parsePositiveNumber(query.serviceOrderId, undefined, 'serviceOrderId');
      qb.andWhere('serviceOrderItem.serviceOrderId = :serviceOrderId', { serviceOrderId });
    }

    let technicianId: number | undefined;
    if (query.assignedToMe === 'true') {
      if (!currentUserId) {
        throw new BadRequestException('No se puede filtrar por assignedToMe sin usuario autenticado');
      }
      technicianId = currentUserId;
    } else if (query.technicianId !== undefined) {
      technicianId = this.parsePositiveNumber(query.technicianId, undefined, 'technicianId');
    }

    if (technicianId !== undefined) {
      qb.andWhere('serviceOrderItem.assignedToTechnicianId = :technicianId', { technicianId });
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const normalized = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(serviceOrderItem.serialNumber) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.model) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.brand) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.initialIssue) LIKE :search')
            .orWhere('LOWER(serviceOrder.code) LIKE :search');
        }),
      ).setParameter('search', normalized);
    }

    qb.orderBy('serviceOrderItem.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false): Promise<ServiceOrderItem> {
    const qb = this.serviceOrderItemRepository
      .createQueryBuilder('serviceOrderItem')
      .leftJoinAndSelect('serviceOrderItem.assignedTechnician', 'assignedTechnician')
      .leftJoinAndSelect('serviceOrderItem.serviceOrder', 'serviceOrder')
      .where('serviceOrderItem.id = :id', { id });

    if (withDeleted) {
      qb.withDeleted();
    }

    const item = await qb.getOne();
    if (!item) {
      throw new NotFoundException(`ServiceOrder item with id ${id} not found`);
    }

    return item;
  }

  private async prepareTechnicianAssignmentSnapshot(): Promise<TechnicianAssignmentSnapshot[]> {
    const technicians = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.roles', 'role')
      .distinct(true)
      .where('LOWER(role.name) IN (:...roles)', { roles: [...TECHNICIAN_ROLE_NAMES] })
      .andWhere('user.isActive = true')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    if (!technicians.length) {
      throw new BadRequestException('No hay tecnicos disponibles para asignar ordenes');
    }

    const technicianIds = technicians.map((tech) => tech.id);
    await this.ensureBalanceRows(technicianIds);

    const balances = await this.technicianAssignmentBalanceRepository.find({
      where: { technicianId: In(technicianIds) },
    });

    return technicians.map((technician) => {
      const byType = new Map<ServiceType, TechnicianTypeBalance>();
      let totalActiveCount = 0;

      for (const serviceType of Object.values(ServiceType)) {
        const balance = balances.find(
          (entry) => entry.technicianId === technician.id && entry.serviceType === serviceType,
        );

        const normalized: TechnicianTypeBalance = {
          assignedCount: balance?.assignedCount ?? 0,
          activeCount: balance?.activeCount ?? 0,
          lastAssignedAt: balance?.lastAssignedAt ?? null,
        };

        totalActiveCount += normalized.activeCount;
        byType.set(serviceType, normalized);
      }

      return {
        technicianId: technician.id,
        totalActiveCount,
        byType,
      };
    });
  }

  private pickTechnicianId(
    snapshot: TechnicianAssignmentSnapshot[],
    serviceType: ServiceType,
    now: Date,
  ): number {
    const candidates = [...snapshot];
    if (!candidates.length) {
      throw new BadRequestException('No hay tecnicos disponibles para asignar ordenes');
    }

    candidates.sort((a, b) => {
      const aTypeBalance = a.byType.get(serviceType)!;
      const bTypeBalance = b.byType.get(serviceType)!;

      if (aTypeBalance.assignedCount !== bTypeBalance.assignedCount) {
        return aTypeBalance.assignedCount - bTypeBalance.assignedCount;
      }

      if (a.totalActiveCount !== b.totalActiveCount) {
        return a.totalActiveCount - b.totalActiveCount;
      }

      if (aTypeBalance.activeCount !== bTypeBalance.activeCount) {
        return aTypeBalance.activeCount - bTypeBalance.activeCount;
      }

      const aLastAssignedAt = aTypeBalance.lastAssignedAt?.getTime() ?? 0;
      const bLastAssignedAt = bTypeBalance.lastAssignedAt?.getTime() ?? 0;
      if (aLastAssignedAt !== bLastAssignedAt) {
        return aLastAssignedAt - bLastAssignedAt;
      }

      return a.technicianId - b.technicianId;
    });

    const winner = candidates[0];
    const winnerTypeBalance = winner.byType.get(serviceType)!;
    winnerTypeBalance.assignedCount += 1;
    winnerTypeBalance.activeCount += 1;
    winnerTypeBalance.lastAssignedAt = now;
    winner.totalActiveCount += 1;

    const technicianId = winner.technicianId;
    return technicianId;
  }

  async assignTechnician(itemId: number, technicianId: number): Promise<ServiceOrderItem> {
    const item = await this.serviceOrderItemRepository.findOne({
      where: { id: itemId },
      relations: { serviceOrder: { client: true } },
    });

    if (!item) {
      throw new NotFoundException(`ServiceOrder item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`ServiceOrder item with id ${itemId} is deleted`);
    }

    if (this.terminalItemStatuses.includes(item.status)) {
      throw new BadRequestException(`ServiceOrder item ${itemId} cannot be reassigned from terminal status ${item.status}`);
    }

    await this.ensureTechnician(technicianId);

    const previousTechnicianId = item.assignedToTechnicianId;
    if (previousTechnicianId === technicianId) {
      return item;
    }

    item.assignedToTechnicianId = technicianId;
    item.assignedAt = new Date();

    await this.serviceOrderItemRepository.save(item);
    if (previousTechnicianId) {
      await this.adjustTechnicianBalance(previousTechnicianId, item.serviceType, 0, -1);
    }
    await this.adjustTechnicianBalance(technicianId, item.serviceType, 1, 1, item.assignedAt);
    await this.refreshAggregatesForServiceOrder(item.serviceOrderId);
    await this.notifyTechnicianAssignmentForItem(item, technicianId, previousTechnicianId);

    return item;
  }

  async notifyTechnicianAssignmentsForServiceOrder(
    serviceOrderCode: string,
    items: ServiceOrderItem[],
    clientPhone: string | null,
  ): Promise<void> {
    if (!clientPhone) {
      return;
    }

    const webhookUrl = this.getAssignmentWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    const technicianIds = [
      ...new Set(
        items
          .map((item) => item.assignedToTechnicianId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];

    if (!technicianIds.length) {
      return;
    }

    const technicians = await this.userRepository.find({ where: { id: In(technicianIds) } });
    const technicianMap = new Map(technicians.map((tech) => [tech.id, tech]));

    await Promise.all(
      items
        .filter((item) => typeof item.assignedToTechnicianId === 'number')
        .map(async (item) => {
          const technician = technicianMap.get(item.assignedToTechnicianId!);
          await this.sendTechnicianAssignmentWebhook(webhookUrl, {
            phone: clientPhone,
            code: this.buildServiceOrderItemCode(serviceOrderCode, item.itemNumber),
            brand: item.brand ?? null,
            model: item.model ?? null,
            serialNumber: item.serialNumber ?? null,
            technicianName: technician?.name ?? `Tecnico #${item.assignedToTechnicianId}`,
            assignmentType: 'assigned',
          });
        }),
    );
  }

  private async notifyTechnicianAssignmentForItem(
    item: ServiceOrderItem,
    technicianId: number,
    previousTechnicianId: number | null,
  ): Promise<void> {
    const webhookUrl = this.getAssignmentWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    const clientPhone = item.serviceOrder?.client?.phone ?? null;
    if (!clientPhone || previousTechnicianId === technicianId) {
      return;
    }

    const assignmentType =
      previousTechnicianId && previousTechnicianId !== technicianId ? 'reassigned' : 'assigned';

    const technician = await this.userRepository.findOne({ where: { id: technicianId } });

    await this.sendTechnicianAssignmentWebhook(webhookUrl, {
      phone: clientPhone,
      code: this.buildServiceOrderItemCode(item.serviceOrder?.code ?? 'SO', item.itemNumber),
      brand: item.brand ?? null,
      model: item.model ?? null,
      serialNumber: item.serialNumber ?? null,
      technicianName: technician?.name ?? `Tecnico #${technicianId}`,
      assignmentType,
    });
  }

  private getAssignmentWebhookUrl(): string | null {
    const baseUrl = this.configService.get<string>('N8N_WEBHOOK_BASE_URL');
    if (!baseUrl) {
      return null;
    }

    return `${baseUrl.replace(/\/$/, '')}/assigned-technician-message`;
  }

  private buildServiceOrderItemCode(serviceOrderCode: string, itemNumber: number): string {
    return `${serviceOrderCode}-${String(itemNumber).padStart(2, '0')}`;
  }

  private async sendTechnicianAssignmentWebhook(
    url: string,
    payload: {
      phone: string;
      code: string;
      brand: string | null;
      model: string | null;
      serialNumber: string | null;
      technicianName: string;
      assignmentType: 'assigned' | 'reassigned';
    },
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`N8N webhook responded with ${response.status}: ${body || 'sin detalle'}`);
      }
    } catch (error) {
      this.logger.warn(`N8N webhook request failed: ${String(error)}`);
    }
  }

  async softDelete(id: number) {
    const item = await this.serviceOrderItemRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`ServiceOrder item with id ${id} not found`);
    }

    await this.serviceOrderItemRepository.softDelete(id);
    if (item.assignedToTechnicianId && !this.terminalItemStatuses.includes(item.status)) {
      await this.adjustTechnicianBalance(item.assignedToTechnicianId, item.serviceType, 0, -1);
    }
    await this.refreshAggregatesForServiceOrder(item.serviceOrderId);

    return { ok: true, message: `ServiceOrder item with id ${id} deleted successfully` };
  }

  async restore(id: number) {
    const item = await this.serviceOrderItemRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`ServiceOrder item with id ${id} not found`);
    }

    if (!item.deletedAt) {
      return { ok: true, message: 'ServiceOrder item already active' };
    }

    await this.serviceOrderItemRepository.restore(id);
    if (item.assignedToTechnicianId && !this.terminalItemStatuses.includes(item.status)) {
      await this.adjustTechnicianBalance(item.assignedToTechnicianId, item.serviceType, 0, 1);
    }
    await this.refreshAggregatesForServiceOrder(item.serviceOrderId);

    return { ok: true, message: `ServiceOrder item with id ${id} restored successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.serviceOrderItemRepository.find({
      where: { id: In(ids) },
      select: ['id', 'serviceOrderId', 'assignedToTechnicianId', 'serviceType', 'status'],
    });

    if (!existing.length) {
      throw new NotFoundException('No service order items found for provided ids');
    }

    const existingIds = existing.map((item) => item.id);
    await Promise.all(
      existing
        .filter((item) => item.assignedToTechnicianId && !this.terminalItemStatuses.includes(item.status))
        .map((item) => this.adjustTechnicianBalance(item.assignedToTechnicianId!, item.serviceType, 0, -1)),
    );
    await this.serviceOrderItemRepository.softDelete(existingIds);

    const serviceOrderIds = [...new Set(existing.map((item) => item.serviceOrderId))];
    await Promise.all(serviceOrderIds.map((serviceOrderId) => this.refreshAggregatesForServiceOrder(serviceOrderId)));

    return { ok: true, message: `${existingIds.length} service order items deleted successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.serviceOrderItemRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
      select: ['id', 'serviceOrderId', 'deletedAt', 'assignedToTechnicianId', 'serviceType', 'status'],
    });

    const deletedItems = existing.filter((item) => item.deletedAt);
    if (!deletedItems.length) {
      throw new NotFoundException('No deleted service order items found for provided ids');
    }

    const idsToRestore = deletedItems.map((item) => item.id);
    await this.serviceOrderItemRepository.restore(idsToRestore);
    await Promise.all(
      deletedItems
        .filter((item) => item.assignedToTechnicianId && !this.terminalItemStatuses.includes(item.status))
        .map((item) => this.adjustTechnicianBalance(item.assignedToTechnicianId!, item.serviceType, 0, 1)),
    );

    const serviceOrderIds = [...new Set(deletedItems.map((item) => item.serviceOrderId))];
    await Promise.all(serviceOrderIds.map((serviceOrderId) => this.refreshAggregatesForServiceOrder(serviceOrderId)));

    return { ok: true, message: `${idsToRestore.length} service order items restored successfully` };
  }

  async changeStatus(
    itemId: number,
    newStatus: ServiceOrderItemStatus,
    actorId?: number,
    reason?: string,
  ) {
    const item = await this.serviceOrderItemRepository.findOne({
      where: { id: itemId },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`ServiceOrder item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`ServiceOrder item with id ${itemId} is deleted`);
    }

    if (!canTransitionServiceOrderItem(item.status, newStatus, item.serviceType)) {
      throw new BadRequestException(
        `Cannot transition service order item ${itemId} from ${item.status} to ${newStatus} (serviceType: ${item.serviceType})`,
      );
    }

    if (newStatus === ServiceOrderItemStatus.IN_DIAGNOSIS) {
      const technicianId = item.assignedToTechnicianId;
      if (!technicianId) {
        throw new BadRequestException(
          `ServiceOrder item ${itemId} cannot enter diagnosis without assigned technician`,
        );
      }

      const existingDiagnosis = await this.serviceOrderItemRepository.findOne({
        where: {
          assignedToTechnicianId: technicianId,
          status: ServiceOrderItemStatus.IN_DIAGNOSIS,
          id: Not(itemId),
          deletedAt: IsNull(),
        },
      });

      if (existingDiagnosis) {
        throw new BadRequestException(
          `Technician ${technicianId} already has item ${existingDiagnosis.id} in IN_DIAGNOSIS`,
        );
      }
    }

    const previousStatus = item.status;
    const now = new Date();
    item.status = newStatus;

    switch (newStatus) {
      case ServiceOrderItemStatus.ASSIGNED:
        item.assignedAt = now;
        break;
      case ServiceOrderItemStatus.IN_DIAGNOSIS:
        item.diagnosisStartedAt = now;
        item.diagnosisCompletedAt = null;
        break;
      case ServiceOrderItemStatus.DIAGNOSED:
        item.diagnosisCompletedAt = now;
        break;
      case ServiceOrderItemStatus.QUOTED:
        item.quotedAt = now;
        break;
      case ServiceOrderItemStatus.SENT_TO_CLIENT:
        item.quoteSentAt = now;
        break;
      case ServiceOrderItemStatus.CLIENT_APPROVED:
        item.quoteApprovedAt = now;
        item.lastCustomerResponseAt = now;
        break;
      case ServiceOrderItemStatus.QUOTE_EXPIRED:
      case ServiceOrderItemStatus.CLIENT_REJECTED:
      case ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT:
        item.quoteRejectedAt = now;
        item.lastCustomerResponseAt = now;
        break;
      case ServiceOrderItemStatus.IN_REPAIR:
        item.repairStartedAt = now;
        item.repairCompletedAt = null;
        break;
      case ServiceOrderItemStatus.REPAIRED:
        item.repairCompletedAt = now;
        break;
      case ServiceOrderItemStatus.DELIVERED:
        item.deliveredAt = now;
        break;
      case ServiceOrderItemStatus.CANCELLED:
        item.cancelledAt = now;
        break;
      default:
        break;
    }

    await this.serviceOrderItemRepository.save(item);
    if (item.assignedToTechnicianId) {
      const movedToTerminal =
        !this.terminalItemStatuses.includes(previousStatus) && this.terminalItemStatuses.includes(newStatus);
      const movedOutOfTerminal =
        this.terminalItemStatuses.includes(previousStatus) && !this.terminalItemStatuses.includes(newStatus);

      if (movedToTerminal) {
        await this.adjustTechnicianBalance(item.assignedToTechnicianId, item.serviceType, 0, -1);
      } else if (movedOutOfTerminal) {
        await this.adjustTechnicianBalance(item.assignedToTechnicianId, item.serviceType, 0, 1);
      }
    }
    await this.createItemEvent(item.id, previousStatus, newStatus, actorId, reason);
    await this.refreshAggregatesForServiceOrder(item.serviceOrderId);

    return item;
  }

  async requestRediagnosis(itemId: number, reason: string, actorId?: number) {
    if (!reason?.trim()) {
      throw new BadRequestException('Reason is required to request a new diagnosis');
    }

    const item = await this.serviceOrderItemRepository.findOne({
      where: { id: itemId },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`ServiceOrder item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`ServiceOrder item with id ${itemId} is deleted`);
    }

    if (item.status !== ServiceOrderItemStatus.IN_REPAIR) {
      throw new BadRequestException(
        `ServiceOrder item ${itemId} must be IN_REPAIR to request a new diagnosis`,
      );
    }

    if (item.serviceType !== ServiceType.DIAGNOSIS) {
      throw new BadRequestException(
        `ServiceOrder item ${itemId} must be DIAGNOSIS to request a new diagnosis`,
      );
    }

    return this.changeStatus(itemId, ServiceOrderItemStatus.IN_DIAGNOSIS, actorId, reason);
  }

  private async createItemEvent(
    serviceOrderItemId: number,
    fromStatus: ServiceOrderItemStatus,
    toStatus: ServiceOrderItemStatus,
    actorId?: number,
    reason?: string,
  ): Promise<void> {
    const event = this.serviceOrderItemEventRepository.create({
      serviceOrderItemId,
      fromStatus,
      toStatus,
      actorId: actorId ?? null,
      reason: reason ?? null,
    });
    await this.serviceOrderItemEventRepository.save(event);
  }

  private async refreshAggregatesForServiceOrder(serviceOrderId?: number) {
    if (!serviceOrderId) {
      return;
    }

    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id: serviceOrderId },
      relations: ['items'],
      withDeleted: true,
    });

    if (!serviceOrder) {
      return;
    }

    this.applyAggregates(serviceOrder);
    await this.serviceOrderRepository.save(serviceOrder);
  }

  private async ensureTechnician(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    if (!user.isActive || user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }
    if (!hasRoleName(user.roles, TECHNICIAN_ROLE_NAMES)) {
      throw new BadRequestException(`User with id ${id} is not a technician`);
    }
    return user;
  }

  private async ensureBalanceRows(technicianIds: number[]): Promise<void> {
    const existing = await this.technicianAssignmentBalanceRepository.find({
      where: { technicianId: In(technicianIds) },
      select: ['technicianId', 'serviceType'],
    });

    const existingKeys = new Set(existing.map((entry) => `${entry.technicianId}:${entry.serviceType}`));
    const missing = technicianIds.flatMap((technicianId) =>
      Object.values(ServiceType)
        .filter((serviceType) => !existingKeys.has(`${technicianId}:${serviceType}`))
        .map((serviceType) =>
          this.technicianAssignmentBalanceRepository.create({
            technicianId,
            serviceType,
            assignedCount: 0,
            activeCount: 0,
            lastAssignedAt: null,
          }),
        ),
    );

    if (missing.length) {
      await this.technicianAssignmentBalanceRepository.save(missing);
    }
  }

  private async adjustTechnicianBalance(
    technicianId: number,
    serviceType: ServiceType,
    assignedDelta: number,
    activeDelta: number,
    lastAssignedAt?: Date | null,
  ): Promise<void> {
    await this.ensureBalanceRows([technicianId]);
    const balance = await this.technicianAssignmentBalanceRepository.findOne({
      where: { technicianId, serviceType },
    });

    if (!balance) {
      throw new NotFoundException(`TechnicianAssignmentBalance for technician ${technicianId} and ${serviceType} not found`);
    }

    balance.assignedCount = Math.max(0, Number(balance.assignedCount ?? 0) + assignedDelta);
    balance.activeCount = Math.max(0, Number(balance.activeCount ?? 0) + activeDelta);

    if (lastAssignedAt) {
      balance.lastAssignedAt = lastAssignedAt;
    }

    await this.technicianAssignmentBalanceRepository.save(balance);
  }

  private ensureIds(ids: number[]) {
    if (!ids?.length) {
      throw new BadRequestException('No ids provided');
    }
  }

  private parsePositiveNumber(
    value: number | string | undefined,
    fallback: number | undefined,
    field: string,
    max?: number,
  ): number {
    if (value === undefined || value === null || value === '') {
      return fallback ?? (() => {
        throw new BadRequestException(`${field} is required`);
      })();
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }

    const normalized = Math.floor(parsed);
    if (max && normalized > max) {
      return max;
    }

    return normalized;
  }

  private parseEnumList<T extends string>(
    value: string | undefined,
    enumObject: Record<string, string>,
    field: string,
  ): T[] | undefined {
    if (!value) {
      return undefined;
    }

    const values = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) as T[];

    const allowed = Object.values(enumObject);
    const invalid = values.filter((entry) => !allowed.includes(entry));

    if (invalid.length) {
      throw new BadRequestException(`${field} contains invalid values: ${invalid.join(', ')}`);
    }

    return values;
  }
}
