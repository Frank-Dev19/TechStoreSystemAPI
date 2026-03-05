import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, Brackets, In, Not, IsNull } from 'typeorm';
import { TicketItem } from '../entities/ticket-item.entity';
import { Ticket } from '../entities/ticket.entity';
import { TechnicianMetrics } from '../entities/technician-metrics.entity';
import { TicketItemCycle } from '../entities/ticket-item-cycle.entity';
import { TicketItemEvent } from '../entities/ticket-item-event.entity';
import { CreateTicketItemDto } from '../dto/create-ticket-item.dto';
import { ServiceType, TicketItemCyclePhase, TicketItemStatus, TicketStatus } from '../enums';
import { canTransitionTicketItem } from '../state-machines/ticket-item.state-machine';
import { User } from '../../users/entities/user.entity';
import {
  hasRoleName,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
} from '../../common/constants/role-names';

type FindTicketItemsQuery = {
  page?: number | string;
  limit?: number | string;
  status?: string;
  ticketId?: number | string;
  technicianId?: number | string;
  assignedToMe?: string;
  withDeleted?: string;
  search?: string;
};

@Injectable()
export class TicketItemService {
  constructor(
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TechnicianMetrics)
    private readonly technicianMetricsRepository: Repository<TechnicianMetrics>,
    @InjectRepository(TicketItemCycle)
    private readonly ticketItemCycleRepository: Repository<TicketItemCycle>,
    @InjectRepository(TicketItemEvent)
    private readonly ticketItemEventRepository: Repository<TicketItemEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(TicketItemService.name);

  private readonly terminalItemStatuses = [
    TicketItemStatus.DELIVERED,
    TicketItemStatus.CANCELLED,
  ];

  async createItemsWithAutoAssignment(
    dtos: CreateTicketItemDto[],
    startingNumber: number,
    now: Date,
  ): Promise<TicketItem[]> {
    if (!dtos?.length) {
      return [];
    }

    const technicianLoads = await this.prepareTechnicianLoadMap();
    const supervisorLoads = await this.prepareSupervisorLoadMap();

    return dtos.map((dto, index) => {
      const technicianId = this.pickTechnicianId(technicianLoads);
      const supervisorId = this.pickSupervisorId(supervisorLoads);
      return this.buildTicketItem(dto, startingNumber + index + 1, now, technicianId, supervisorId);
    });
  }

  private buildTicketItem(
    dto: CreateTicketItemDto,
    itemNumber: number,
    now: Date,
    technicianId?: number,
    supervisorId?: number,
  ): TicketItem {
    const partial: DeepPartial<TicketItem> = {
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
      assignedToSupervisorId: supervisorId ?? null,
      assignedSupervisorAt: supervisorId ? now : null,
      status: technicianId ? TicketItemStatus.ASSIGNED : TicketItemStatus.ASSIGNED,
    };

    return this.ticketItemRepository.create(partial);
  }

  applyAggregates(ticket: Ticket): void {
    const items = ticket.items ?? [];
    const activeItems = items.filter((item) => !item.deletedAt);

    ticket.itemsCount = activeItems.length;

    const terminalStatuses = this.terminalItemStatuses;

    ticket.completedItemsCount = activeItems.filter((item) =>
      terminalStatuses.includes(item.status),
    ).length;

    if (!activeItems.length) {
      ticket.status = TicketStatus.CANCELLED;
      return;
    }

    const allCancelled = activeItems.every((item) => item.status === TicketItemStatus.CANCELLED);
    if (allCancelled) {
      ticket.status = TicketStatus.CANCELLED;
      return;
    }

    const allTerminal = activeItems.every((item) => terminalStatuses.includes(item.status));
    if (allTerminal) {
      ticket.status = TicketStatus.COMPLETED;
      return;
    }

    const hasTerminal = activeItems.some((item) => terminalStatuses.includes(item.status));
    if (hasTerminal) {
      ticket.status = TicketStatus.PARTIALLY_COMPLETED;
      return;
    }

    const hasProgress = activeItems.some((item) => item.status !== TicketItemStatus.ASSIGNED);
    if (hasProgress) {
      ticket.status = TicketStatus.IN_PROGRESS;
      return;
    }

    ticket.status = TicketStatus.OPEN;
  }

  async findAll(query: FindTicketItemsQuery, currentUserId?: number) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';
    const statusAliases: Record<string, TicketItemStatus> = {
      RECEIVED: TicketItemStatus.ASSIGNED,
      QUOTE_SENT: TicketItemStatus.SENT_TO_CLIENT,
      QUOTE_APPROVED: TicketItemStatus.CLIENT_APPROVED,
    };
    const normalizedStatusParam = query.status
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => statusAliases[entry] ?? entry)
      .join(',');
    const statuses = this.parseEnumList<TicketItemStatus>(normalizedStatusParam, TicketItemStatus, 'status');

    const qb = this.ticketItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.ticket', 'ticket');

    if (includeDeleted) {
      qb.withDeleted();
    }

    if (statuses?.length) {
      qb.andWhere('item.status IN (:...statuses)', { statuses });
    }

    if (query.ticketId !== undefined) {
      const ticketId = this.parsePositiveNumber(query.ticketId, undefined, 'ticketId');
      qb.andWhere('item.ticketId = :ticketId', { ticketId });
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
      qb.andWhere('item.assignedToTechnicianId = :technicianId', { technicianId });
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const normalized = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(item.serialNumber) LIKE :search')
            .orWhere('LOWER(item.model) LIKE :search')
            .orWhere('LOWER(item.brand) LIKE :search')
            .orWhere('LOWER(item.initialIssue) LIKE :search')
            .orWhere('LOWER(ticket.code) LIKE :search');
        }),
      ).setParameter('search', normalized);
    }

    qb
      .orderBy('item.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number, withDeleted = false): Promise<TicketItem> {
    const qb = this.ticketItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.assignedTechnician', 'technician')
      .leftJoinAndSelect('item.assignedSupervisor', 'supervisor')
      .where('item.id = :id', { id });

    if (withDeleted) {
      qb.withDeleted();
    }

    const item = await qb.getOne();

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }

    return item;
  }

  private async prepareTechnicianLoadMap(): Promise<Map<number, number>> {
    const technicians = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .distinct(true)
      .where('LOWER(role.name) IN (:...roles)', { roles: [...TECHNICIAN_ROLE_NAMES] })
      .andWhere('user.isActive = true')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    if (!technicians.length) {
      throw new BadRequestException('No hay técnicos disponibles para asignar ticket items');
    }

    const loadMap = new Map<number, number>();
    technicians.forEach((tech) => loadMap.set(tech.id, 0));

    const loadRows = await this.ticketItemRepository
      .createQueryBuilder('item')
      .select('item.assignedToTechnicianId', 'technicianId')
      .addSelect('COUNT(*)', 'count')
      .where('item.assignedToTechnicianId IS NOT NULL')
      .andWhere('item.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: this.terminalItemStatuses,
      })
      .andWhere('item.deletedAt IS NULL')
      .groupBy('item.assignedToTechnicianId')
      .getRawMany<{ technicianId: string; count: string }>();

    for (const row of loadRows) {
      const technicianId = Number(row.technicianId);
      if (loadMap.has(technicianId)) {
        loadMap.set(technicianId, Number(row.count));
      }
    }

    return loadMap;
  }

  private pickTechnicianId(loadMap: Map<number, number>): number {
    const candidates = [...loadMap.entries()];
    if (!candidates.length) {
      throw new BadRequestException('No hay técnicos disponibles para asignar ticket items');
    }

    candidates.sort((a, b) => {
      if (a[1] === b[1]) {
        return a[0] - b[0];
      }
      return a[1] - b[1];
    });

    const [technicianId, load] = candidates[0];
    loadMap.set(technicianId, load + 1);
    return technicianId;
  }

  private async prepareSupervisorLoadMap(): Promise<Map<number, number>> {
    const supervisors = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .distinct(true)
      .where('LOWER(role.name) IN (:...roles)', { roles: [...SUPERVISOR_ROLE_NAMES] })
      .andWhere('user.isActive = true')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    if (!supervisors.length) {
      throw new BadRequestException('No hay supervisores disponibles para asignar ticket items');
    }

    const loadMap = new Map<number, number>();
    supervisors.forEach((sup) => loadMap.set(sup.id, 0));

    const loadRows = await this.ticketItemRepository
      .createQueryBuilder('item')
      .select('item.assignedToSupervisorId', 'supervisorId')
      .addSelect('COUNT(*)', 'count')
      .where('item.assignedToSupervisorId IS NOT NULL')
      .andWhere('item.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: this.terminalItemStatuses,
      })
      .andWhere('item.deletedAt IS NULL')
      .groupBy('item.assignedToSupervisorId')
      .getRawMany<{ supervisorId: string; count: string }>();

    for (const row of loadRows) {
      const supervisorId = Number(row.supervisorId);
      if (loadMap.has(supervisorId)) {
        loadMap.set(supervisorId, Number(row.count));
      }
    }

    return loadMap;
  }

  private pickSupervisorId(loadMap: Map<number, number>): number {
    const candidates = [...loadMap.entries()];
    if (!candidates.length) {
      throw new BadRequestException('No hay supervisores disponibles para asignar ticket items');
    }

    candidates.sort((a, b) => {
      if (a[1] === b[1]) {
        return a[0] - b[0];
      }
      return a[1] - b[1];
    });

    const [supervisorId, load] = candidates[0];
    loadMap.set(supervisorId, load + 1);
    return supervisorId;
  }

  async assignTechnician(itemId: number, technicianId: number): Promise<TicketItem> {
    const item = await this.ticketItemRepository.findOne({
      where: { id: itemId },
      relations: {
        ticket: {
          client: true,
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`Ticket item with id ${itemId} is deleted`);
    }

    await this.ensureTechnician(technicianId);

    const previousTechnicianId = item.assignedToTechnicianId;
    item.assignedToTechnicianId = technicianId;
    item.assignedAt = new Date();

    await this.ticketItemRepository.save(item);
    await this.refreshAggregatesForTicket(item.ticketId);
    await this.notifyTechnicianAssignmentForItem(item, technicianId, previousTechnicianId);

    return item;
  }

  async assignSupervisor(itemId: number, supervisorId: number): Promise<TicketItem> {
    const item = await this.ticketItemRepository.findOne({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`Ticket item with id ${itemId} is deleted`);
    }

    await this.ensureSupervisor(supervisorId);

    item.assignedToSupervisorId = supervisorId;
    item.assignedSupervisorAt = new Date();

    await this.ticketItemRepository.save(item);
    await this.refreshAggregatesForTicket(item.ticketId);

    return item;
  }

  async notifyTechnicianAssignmentsForTicket(
    ticketCode: string,
    items: TicketItem[],
    contactPhone: string | null,
  ): Promise<void> {
    if (!contactPhone) {
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

    const technicians = await this.userRepository.find({
      where: { id: In(technicianIds) },
    });
    const technicianMap = new Map(technicians.map((tech) => [tech.id, tech]));

    await Promise.all(
      items
        .filter((item) => typeof item.assignedToTechnicianId === 'number')
        .map(async (item) => {
          const technician = technicianMap.get(item.assignedToTechnicianId!);
          await this.sendTechnicianAssignmentWebhook(webhookUrl, {
            phone: contactPhone,
            code: this.buildTicketItemCode(ticketCode, item.itemNumber),
            brand: item.brand ?? null,
            model: item.model ?? null,
            serialNumber: item.serialNumber ?? null,
            technicianName: technician?.name ?? `Técnico #${item.assignedToTechnicianId}`,
            assignmentType: 'assigned',
          });
        }),
    );
  }

  private async notifyTechnicianAssignmentForItem(
    item: TicketItem,
    technicianId: number,
    previousTechnicianId: number | null,
  ): Promise<void> {
    const webhookUrl = this.getAssignmentWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    const contactPhone =
      item.ticket?.contactPhone ?? item.ticket?.client?.phone ?? null;

    if (!contactPhone) {
      return;
    }

    const assignmentType =
      previousTechnicianId && previousTechnicianId !== technicianId ? 'reassigned' : 'assigned';

    if (previousTechnicianId === technicianId) {
      return;
    }

    const technician = await this.userRepository.findOne({
      where: { id: technicianId },
    });

    await this.sendTechnicianAssignmentWebhook(webhookUrl, {
      phone: contactPhone,
      code: this.buildTicketItemCode(item.ticket?.code ?? 'ST', item.itemNumber),
      brand: item.brand ?? null,
      model: item.model ?? null,
      serialNumber: item.serialNumber ?? null,
      technicianName: technician?.name ?? `Técnico #${technicianId}`,
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

  private buildTicketItemCode(ticketCode: string, itemNumber: number): string {
    return `${ticketCode}${itemNumber}`;
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
        this.logger.warn(
          `N8N webhook responded with ${response.status}: ${body || 'sin detalle'}`,
        );
      }
    } catch (error) {
      this.logger.warn(`N8N webhook request failed: ${String(error)}`);
    }
  }

  async softDelete(id: number) {
    const item = await this.ticketItemRepository.findOne({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }

    await this.ticketItemRepository.softDelete(id);
    await this.refreshAggregatesForTicket(item.ticketId);

    return { ok: true, message: `Ticket item with id ${id} deleted successfully` };
  }

  async restore(id: number) {
    const item = await this.ticketItemRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }

    if (!item.deletedAt) {
      return { ok: true, message: 'Ticket item already active' };
    }

    await this.ticketItemRepository.restore(id);
    await this.refreshAggregatesForTicket(item.ticketId);

    return { ok: true, message: `Ticket item with id ${id} restored successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.ticketItemRepository.find({
      where: { id: In(ids) },
      select: ['id', 'ticketId'],
    });

    if (!existing.length) {
      throw new NotFoundException('No ticket items found for provided ids');
    }

    const existingIds = existing.map((item) => item.id);
    await this.ticketItemRepository.softDelete(existingIds);

    const ticketIds = [...new Set(existing.map((item) => item.ticketId))];
    await Promise.all(ticketIds.map((ticketId) => this.refreshAggregatesForTicket(ticketId)));

    return { ok: true, message: `${existingIds.length} ticket items deleted successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.ticketItemRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
      select: ['id', 'ticketId', 'deletedAt'],
    });

    const deletedItems = existing.filter((item) => item.deletedAt);
    if (!deletedItems.length) {
      throw new NotFoundException('No deleted ticket items found for provided ids');
    }

    const idsToRestore = deletedItems.map((item) => item.id);
    await this.ticketItemRepository.restore(idsToRestore);

    const ticketIds = [...new Set(deletedItems.map((item) => item.ticketId))];
    await Promise.all(ticketIds.map((ticketId) => this.refreshAggregatesForTicket(ticketId)));

    return { ok: true, message: `${idsToRestore.length} ticket items restored successfully` };
  }

  async changeStatus(
    itemId: number,
    newStatus: TicketItemStatus,
    actorId?: number,
    reason?: string,
  ) {
    const item = await this.ticketItemRepository.findOne({
      where: { id: itemId },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`Ticket item with id ${itemId} is deleted`);
    }

    if (!canTransitionTicketItem(item.status, newStatus, item.serviceType)) {
      throw new BadRequestException(
        `Cannot transition ticket item ${itemId} from ${item.status} to ${newStatus} (serviceType: ${item.serviceType})`,
      );
    }

    if (newStatus === TicketItemStatus.IN_DIAGNOSIS) {
      const technicianId = item.assignedToTechnicianId;
      if (!technicianId) {
        throw new BadRequestException(
          `Ticket item ${itemId} cannot enter diagnosis without assigned technician`,
        );
      }

      const existingDiagnosis = await this.ticketItemRepository.findOne({
        where: {
          assignedToTechnicianId: technicianId,
          status: TicketItemStatus.IN_DIAGNOSIS,
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
    item.status = newStatus;
    const now = new Date();

    await this.handleCycleTransition(item, previousStatus, newStatus, now, reason);

    switch (newStatus) {
      case TicketItemStatus.ASSIGNED:
        item.assignedAt = now;
        break;
      case TicketItemStatus.IN_DIAGNOSIS:
        item.diagnosisStartedAt = now;
        item.diagnosisCompletedAt = null;
        break;
      case TicketItemStatus.DIAGNOSED:
        item.diagnosisCompletedAt = now;
        break;
      case TicketItemStatus.QUOTED:
        item.quotedAt = now;
        break;
      case TicketItemStatus.SUPERVISOR_APPROVED:
        item.supervisorApprovedAt = now;
        break;
      case TicketItemStatus.SUPERVISOR_REJECTED:
        item.supervisorRejectedAt = now;
        break;
      case TicketItemStatus.SENT_TO_CLIENT:
        item.quoteSentAt = now;
        break;
      case TicketItemStatus.AWAITING_CLIENT_RESPONSE:
        // No hay timestamp específico, se usa quoteSentAt como referencia
        break;
      case TicketItemStatus.CLIENT_APPROVED:
        item.quoteApprovedAt = now;
        item.lastCustomerResponseAt = now;
        break;
      case TicketItemStatus.QUOTE_EXPIRED:
        item.quoteRejectedAt = item.quoteRejectedAt ?? now;
        break;
      case TicketItemStatus.CLIENT_REJECTED:
        item.quoteRejectedAt = now;
        item.lastCustomerResponseAt = now;
        break;
      case TicketItemStatus.IN_REPAIR:
        item.repairStartedAt = now;
        item.repairCompletedAt = null;
        break;
      case TicketItemStatus.REPAIRED:
        item.repairCompletedAt = now;
        break;
      case TicketItemStatus.DELIVERED:
        item.deliveredAt = now;
        break;
      case TicketItemStatus.CANCELLED:
        item.cancelledAt = now;
        break;
      default:
        break;
    }

    await this.ticketItemRepository.save(item);
    await this.createItemEvent(item.id, previousStatus, newStatus, actorId, reason);
    await this.refreshAggregatesForTicket(item.ticketId);

    return item;
  }

  async requestRediagnosis(itemId: number, reason: string, actorId?: number) {
    if (!reason?.trim()) {
      throw new BadRequestException('Reason is required to request a new diagnosis');
    }

    const item = await this.ticketItemRepository.findOne({
      where: { id: itemId },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`Ticket item with id ${itemId} is deleted`);
    }

    if (item.status !== TicketItemStatus.IN_REPAIR) {
      throw new BadRequestException(
        `Ticket item ${itemId} must be IN_REPAIR to request a new diagnosis`,
      );
    }

    if (item.serviceType !== ServiceType.DIAGNOSIS) {
      throw new BadRequestException(
        `Ticket item ${itemId} must be DIAGNOSIS to request a new diagnosis`,
      );
    }

    return this.changeStatus(itemId, TicketItemStatus.IN_DIAGNOSIS, actorId, reason);
  }

  private async handleCycleTransition(
    item: TicketItem,
    previousStatus: TicketItemStatus,
    newStatus: TicketItemStatus,
    now: Date,
    reason?: string,
  ): Promise<void> {
    if (newStatus === TicketItemStatus.IN_DIAGNOSIS) {
      if (previousStatus === TicketItemStatus.IN_REPAIR) {
        const closedRepair = await this.closeActiveCycle(item.id, TicketItemCyclePhase.REPAIR, now);
        await this.applyCycleHours(item, TicketItemCyclePhase.REPAIR, closedRepair);
      }
      await this.createCycleIfMissing(item, TicketItemCyclePhase.DIAGNOSIS, now, reason);
      return;
    }

    if (newStatus === TicketItemStatus.DIAGNOSED) {
      const closedDiagnosis = await this.closeActiveCycle(item.id, TicketItemCyclePhase.DIAGNOSIS, now);
      await this.applyCycleHours(item, TicketItemCyclePhase.DIAGNOSIS, closedDiagnosis);
      return;
    }

    if (newStatus === TicketItemStatus.IN_REPAIR) {
      await this.createCycleIfMissing(item, TicketItemCyclePhase.REPAIR, now);
      return;
    }

    if (newStatus === TicketItemStatus.REPAIRED) {
      const closedRepair = await this.closeActiveCycle(item.id, TicketItemCyclePhase.REPAIR, now);
      await this.applyCycleHours(item, TicketItemCyclePhase.REPAIR, closedRepair);
    }
  }

  private async createCycleIfMissing(
    item: TicketItem,
    phase: TicketItemCyclePhase,
    now: Date,
    reason?: string,
  ): Promise<TicketItemCycle> {
    const active = await this.ticketItemCycleRepository.findOne({
      where: { ticketItemId: item.id, phase, endedAt: IsNull() },
    });

    if (active) {
      return active;
    }

    const nextSequence = await this.getNextCycleSequence(item.id, phase);
    const cycle = this.ticketItemCycleRepository.create({
      ticketItemId: item.id,
      phase,
      sequenceNumber: nextSequence,
      technicianId: item.assignedToTechnicianId ?? null,
      startedAt: now,
      reason: reason ?? null,
    });

    return this.ticketItemCycleRepository.save(cycle);
  }

  private async closeActiveCycle(
    ticketItemId: number,
    phase: TicketItemCyclePhase,
    now: Date,
  ): Promise<TicketItemCycle | null> {
    const active = await this.ticketItemCycleRepository.findOne({
      where: { ticketItemId, phase, endedAt: IsNull() },
    });

    if (!active) {
      return null;
    }

    active.endedAt = now;
    return this.ticketItemCycleRepository.save(active);
  }

  private async getNextCycleSequence(
    ticketItemId: number,
    phase: TicketItemCyclePhase,
  ): Promise<number> {
    const raw = await this.ticketItemCycleRepository
      .createQueryBuilder('cycle')
      .select('MAX(cycle.sequenceNumber)', 'max')
      .where('cycle.ticketItemId = :ticketItemId', { ticketItemId })
      .andWhere('cycle.phase = :phase', { phase })
      .getRawOne<{ max: string | null } | undefined>();
    const maxValue = raw?.max ?? null;
    return (Number(maxValue) || 0) + 1;
  }

  private async applyCycleHours(
    item: TicketItem,
    phase: TicketItemCyclePhase,
    cycle: TicketItemCycle | null,
  ): Promise<void> {
    if (!cycle?.startedAt || !cycle.endedAt) {
      return;
    }

    const hours = this.calculateBusinessHours(cycle.startedAt, cycle.endedAt);
    if (hours <= 0) {
      return;
    }

    if (phase === TicketItemCyclePhase.DIAGNOSIS) {
      item.actualDiagnosisHours = Number(item.actualDiagnosisHours ?? 0) + hours;
    } else {
      item.actualRepairHours = Number(item.actualRepairHours ?? 0) + hours;
    }

    await this.updateTechnicianMetricsForCycle(cycle.technicianId, phase, hours);
  }

  private async updateTechnicianMetricsForCycle(
    technicianId: number | null,
    phase: TicketItemCyclePhase,
    hours: number,
  ): Promise<void> {
    if (!technicianId || hours <= 0) {
      return;
    }

    const metrics = await this.technicianMetricsRepository.findOne({
      where: { technicianId },
    });

    const entity = metrics ?? this.technicianMetricsRepository.create({ technicianId });

    if (phase === TicketItemCyclePhase.DIAGNOSIS) {
      entity.totalDiagnosisHours = Number(entity.totalDiagnosisHours ?? 0) + hours;
      entity.diagnosisCount = Number(entity.diagnosisCount ?? 0) + 1;
    } else {
      entity.totalRepairHours = Number(entity.totalRepairHours ?? 0) + hours;
      entity.repairCount = Number(entity.repairCount ?? 0) + 1;
    }

    await this.technicianMetricsRepository.save(entity);
  }

  private async createItemEvent(
    ticketItemId: number,
    fromStatus: TicketItemStatus,
    toStatus: TicketItemStatus,
    actorId?: number,
    reason?: string,
  ): Promise<void> {
    const event = this.ticketItemEventRepository.create({
      ticketItemId,
      fromStatus,
      toStatus,
      actorId: actorId ?? null,
      reason: reason ?? null,
    });
    await this.ticketItemEventRepository.save(event);
  }

  private async refreshAggregatesForTicket(ticketId?: number) {
    if (!ticketId) {
      return;
    }

    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['items'],
      withDeleted: true,
    });

    if (!ticket) {
      return;
    }

    this.applyAggregates(ticket);
    await this.ticketRepository.save(ticket);
  }

  private hasItemWithStatus(items: TicketItem[], statuses: TicketItemStatus[]): boolean {
    return items.some((item) => statuses.includes(item.status));
  }

  private async ensureTechnician(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (!user.isActive) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    const isTechnician = hasRoleName(user.roles, TECHNICIAN_ROLE_NAMES);
    if (!isTechnician) {
      throw new BadRequestException(`User with id ${id} is not a technician`);
    }

    return user;
  }

  private async ensureSupervisor(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (!user.isActive) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    const isSupervisor = hasRoleName(user.roles, SUPERVISOR_ROLE_NAMES);
    if (!isSupervisor) {
      throw new BadRequestException(`User with id ${id} is not a supervisor`);
    }

    return user;
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
      throw new BadRequestException(
        `${field} contains invalid values: ${invalid.join(', ')}`,
      );
    }

    return values;
  }

  private calculateBusinessHours(start?: Date | null, end?: Date | null): number {
    if (!start || !end) {
      return 0;
    }
    if (end <= start) {
      return 0;
    }

    const workStartHour = 9;
    const workEndHour = 21;

    let totalMs = 0;
    const current = new Date(start);

    while (current < end) {
      const dayStart = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        workStartHour,
        0,
        0,
        0,
      );
      const dayEnd = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        workEndHour,
        0,
        0,
        0,
      );

      const intervalStart = current > dayStart ? current : dayStart;
      const intervalEnd = end < dayEnd ? end : dayEnd;

      if (intervalEnd > intervalStart) {
        totalMs += intervalEnd.getTime() - intervalStart.getTime();
      }

      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    const hours = totalMs / (1000 * 60 * 60);
    return Number(hours.toFixed(2));
  }
}
