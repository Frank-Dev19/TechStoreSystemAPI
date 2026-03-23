import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import {
  EquipmentType,
  RequestOrigin,
  ServiceOrderPaymentStatus,
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderWorkflowStatus,
  ServiceType,
} from '../enums';
import { CreateServiceOrderDto } from '../dto/create-service-order.dto';
import { UpdateServiceOrderDto } from '../dto/update-service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';

type FindAllServiceOrdersQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: string;
  workflowStatus?: string;
  itemStatus?: string;
  paymentStatus?: string;
  priority?: string;
  clientId?: number | string;
  technicianId?: number | string;
  withDeleted?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class ServiceOrderService {
  constructor(
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly workflowService: ServiceOrderWorkflowService,
  ) {}

  async create(dto: CreateServiceOrderDto, creatorId: number): Promise<ServiceOrder> {
    await this.ensureUser(creatorId);
    const requestOrigin = dto.requestOrigin ?? RequestOrigin.CLIENT;
    const client = await this.resolveClientForRequest(dto.clientId, requestOrigin);
    const code = await this.generateUniqueCode();
    const now = new Date();
    const assignedToTechnicianId = await this.resolveAssignedTechnicianId(
      dto.assignedToTechnicianId,
      dto.serviceType ?? ServiceType.DIAGNOSIS,
    );

    const workflowStatus = this.getInitialWorkflowStatus(dto.serviceType ?? ServiceType.DIAGNOSIS);
    const status =
      workflowStatus === ServiceOrderWorkflowStatus.APPROVED_FOR_WORK
        ? ServiceOrderStatus.ACTIVE
        : ServiceOrderStatus.OPEN;

    const serviceOrder = this.serviceOrderRepository.create({
      code,
      requestOrigin,
      clientId: client?.id ?? null,
      createdBy: creatorId,
      priority: dto.priority ?? ServiceOrderPriority.MEDIUM,
      status,
      workflowStatus,
      paymentStatus: ServiceOrderPaymentStatus.UNPAID,
      assignedToTechnicianId,
      assignedAt: assignedToTechnicianId ? now : null,
      equipmentType: dto.equipmentType,
      equipmentTypeOther:
        dto.equipmentType === EquipmentType.OTHER ? dto.equipmentTypeOther?.trim() ?? null : null,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      serialNumber: dto.serialNumber ?? null,
      accessories: dto.accessories ?? null,
      serviceType: dto.serviceType ?? ServiceType.DIAGNOSIS,
      initialIssue: dto.initialIssue,
      estimatedRepairHours: dto.estimatedRepairHours ?? null,
      receivedAt: now,
      estimatedDeliveryDate: dto.estimatedDeliveryDate ? new Date(dto.estimatedDeliveryDate) : null,
      notes: dto.notes ?? null,
    });

    this.applyClientSnapshot(serviceOrder, client);
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.workflowService.registerInitialAssignment(saved, creatorId);
    return this.findOne(saved.id);
  }

  async findAll(query: FindAllServiceOrdersQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';

    const statuses = this.parseEnumList<ServiceOrderStatus>(query.status, ServiceOrderStatus, 'status');
    const workflowStatuses = this.parseEnumList<ServiceOrderWorkflowStatus>(
      query.workflowStatus ?? query.itemStatus,
      ServiceOrderWorkflowStatus,
      'workflowStatus',
    );
    const paymentStatuses = this.parseEnumList<ServiceOrderPaymentStatus>(
      query.paymentStatus,
      ServiceOrderPaymentStatus,
      'paymentStatus',
    );
    const priorities = this.parseEnumList<ServiceOrderPriority>(query.priority, ServiceOrderPriority, 'priority');

    const qb = this.serviceOrderRepository
      .createQueryBuilder('serviceOrder')
      .leftJoinAndSelect('serviceOrder.assignedTechnician', 'assignedTechnician')
      .leftJoinAndSelect('serviceOrder.client', 'client');

    if (includeDeleted) {
      qb.withDeleted();
    }
    if (statuses?.length) {
      qb.andWhere('serviceOrder.status IN (:...statuses)', { statuses });
    }
    if (workflowStatuses?.length) {
      qb.andWhere('serviceOrder.workflowStatus IN (:...workflowStatuses)', { workflowStatuses });
    }
    if (paymentStatuses?.length) {
      qb.andWhere('serviceOrder.paymentStatus IN (:...paymentStatuses)', { paymentStatuses });
    }
    if (priorities?.length) {
      qb.andWhere('serviceOrder.priority IN (:...priorities)', { priorities });
    }
    if (query.clientId !== undefined) {
      const clientId = this.parsePositiveNumber(query.clientId, undefined, 'clientId');
      qb.andWhere('serviceOrder.clientId = :clientId', { clientId });
    }
    if (query.technicianId !== undefined) {
      const technicianId = this.parsePositiveNumber(query.technicianId, undefined, 'technicianId');
      qb.andWhere('serviceOrder.assignedToTechnicianId = :technicianId', { technicianId });
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const normalized = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(serviceOrder.code) LIKE :search')
            .orWhere('LOWER(serviceOrder.serialNumber) LIKE :search')
            .orWhere('LOWER(serviceOrder.initialIssue) LIKE :search')
            .orWhere('LOWER(serviceOrder.brand) LIKE :search')
            .orWhere('LOWER(serviceOrder.model) LIKE :search')
            .orWhere('LOWER(serviceOrder.clientSnapshotName) LIKE :search')
            .orWhere('LOWER(serviceOrder.equipmentTypeOther) LIKE :search');
        }),
      ).setParameter('search', normalized);
    }

    const fromDate = this.parseDate(query.from, 'from');
    if (fromDate) {
      qb.andWhere('serviceOrder.createdAt >= :from', { from: fromDate });
    }

    const toDate = this.parseDate(query.to, 'to');
    if (toDate) {
      qb.andWhere('serviceOrder.createdAt <= :to', { to: toDate });
    }

    qb.orderBy('serviceOrder.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id },
      relations: ['assignedTechnician', 'client'],
      withDeleted,
    });

    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }

    return serviceOrder;
  }

  async update(id: number, dto: UpdateServiceOrderDto): Promise<ServiceOrder> {
    const serviceOrder = await this.findOne(id, true);

    if (dto.requestOrigin !== undefined || dto.clientId !== undefined) {
      const requestOrigin = dto.requestOrigin ?? serviceOrder.requestOrigin ?? RequestOrigin.CLIENT;
      serviceOrder.requestOrigin = requestOrigin;
      const client = await this.resolveClientForRequest(
        dto.clientId ?? serviceOrder.clientId ?? undefined,
        requestOrigin,
      );
      serviceOrder.clientId = client?.id ?? null;
      this.applyClientSnapshot(serviceOrder, client);
    }

    if (dto.priority !== undefined) serviceOrder.priority = dto.priority;
    if (dto.equipmentType !== undefined) serviceOrder.equipmentType = dto.equipmentType;
    if (dto.equipmentTypeOther !== undefined) serviceOrder.equipmentTypeOther = dto.equipmentTypeOther ?? null;
    if (dto.brand !== undefined) serviceOrder.brand = dto.brand ?? null;
    if (dto.model !== undefined) serviceOrder.model = dto.model ?? null;
    if (dto.serialNumber !== undefined) serviceOrder.serialNumber = dto.serialNumber ?? null;
    if (dto.accessories !== undefined) serviceOrder.accessories = dto.accessories ?? null;
    if (dto.serviceType !== undefined) serviceOrder.serviceType = dto.serviceType;
    if (dto.initialIssue !== undefined) serviceOrder.initialIssue = dto.initialIssue;
    if (dto.estimatedRepairHours !== undefined) serviceOrder.estimatedRepairHours = dto.estimatedRepairHours ?? null;
    if (dto.estimatedDeliveryDate !== undefined) {
      serviceOrder.estimatedDeliveryDate = dto.estimatedDeliveryDate
        ? new Date(dto.estimatedDeliveryDate)
        : null;
    }
    if (dto.notes !== undefined) serviceOrder.notes = dto.notes ?? null;
    if (dto.cancellationReason !== undefined) serviceOrder.cancellationReason = dto.cancellationReason ?? null;
    if (dto.status !== undefined) serviceOrder.status = dto.status;
    if (dto.workflowStatus !== undefined) serviceOrder.workflowStatus = dto.workflowStatus;
    if (dto.paymentStatus !== undefined) serviceOrder.paymentStatus = dto.paymentStatus;

    if (dto.isPaid !== undefined) {
      serviceOrder.isPaid = dto.isPaid;
      serviceOrder.paymentStatus = dto.isPaid ? ServiceOrderPaymentStatus.PAID : ServiceOrderPaymentStatus.UNPAID;
      serviceOrder.paidAt = dto.isPaid ? new Date() : null;
    }

    if (dto.contactName !== undefined) {
      serviceOrder.clientSnapshotName = this.normalizeOptionalValue(dto.contactName, 150);
    }
    if (dto.contactEmail !== undefined) {
      serviceOrder.clientSnapshotEmail = this.normalizeOptionalValue(dto.contactEmail, 150);
    }
    if (dto.contactPhone !== undefined) {
      serviceOrder.clientSnapshotPhone = this.normalizeOptionalValue(dto.contactPhone, 20);
    }

    return this.serviceOrderRepository.save(serviceOrder);
  }

  async softDelete(id: number) {
    await this.ensureExists(id);
    await this.serviceOrderRepository.softDelete(id);
    return { ok: true, message: `ServiceOrder with id ${id} deleted successfully` };
  }

  async restore(id: number) {
    const serviceOrder = await this.serviceOrderRepository.findOne({ where: { id }, withDeleted: true });
    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }
    if (!serviceOrder.deletedAt) {
      return { ok: true, message: 'ServiceOrder already active' };
    }
    await this.serviceOrderRepository.restore(id);
    return { ok: true, message: `ServiceOrder with id ${id} restored successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.serviceOrderRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} service orders deleted successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    await this.serviceOrderRepository.restore(ids);
    return { ok: true, message: `${ids.length} service orders restored successfully` };
  }

  private getInitialWorkflowStatus(serviceType: ServiceType): ServiceOrderWorkflowStatus {
    if ([ServiceType.STANDARD_SERVICE, ServiceType.ASSEMBLY].includes(serviceType)) {
      return ServiceOrderWorkflowStatus.APPROVED_FOR_WORK;
    }
    return ServiceOrderWorkflowStatus.ASSIGNED;
  }

  private async resolveAssignedTechnicianId(
    preferredTechnicianId: number | undefined,
    serviceType: ServiceType,
  ): Promise<number> {
    if (preferredTechnicianId) {
      await this.workflowService.ensureTechnicianAvailable(preferredTechnicianId);
      return preferredTechnicianId;
    }

    const suggestion = await this.workflowService.getAssignmentSuggestion(serviceType);
    return suggestion.suggestedTechnicianId;
  }

  private async ensureExists(id: number) {
    const exists = await this.serviceOrderRepository.findOne({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }
  }

  private async ensureClient(id: number): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: { documentType: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
    return client;
  }

  private async resolveClientForRequest(clientId: number | undefined, requestOrigin: RequestOrigin) {
    if (requestOrigin === RequestOrigin.INTERNAL) {
      return null;
    }
    if (!clientId) {
      throw new BadRequestException('clientId is required for client-origin service orders');
    }
    return this.ensureClient(clientId);
  }

  private applyClientSnapshot(serviceOrder: ServiceOrder, client: Client | null): void {
    if (!client) {
      serviceOrder.clientSnapshotName = null;
      serviceOrder.clientSnapshotDocumentTypeName = null;
      serviceOrder.clientSnapshotDocumentNumber = null;
      serviceOrder.clientSnapshotPhone = null;
      serviceOrder.clientSnapshotEmail = null;
      return;
    }

    serviceOrder.clientSnapshotName = client.name ?? null;
    serviceOrder.clientSnapshotDocumentTypeName = client.documentType?.name ?? null;
    serviceOrder.clientSnapshotDocumentNumber = client.documentNumber ?? null;
    serviceOrder.clientSnapshotPhone = client.phone ?? null;
    serviceOrder.clientSnapshotEmail = client.email ?? null;
  }

  private normalizeOptionalValue(value: string | null | undefined, maxLength: number): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private async ensureUser(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
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
    if (!value) return undefined;
    const values = value.split(',').map((entry) => entry.trim()).filter(Boolean) as T[];
    const allowed = Object.values(enumObject);
    const invalid = values.filter((entry) => !allowed.includes(entry));
    if (invalid.length) {
      throw new BadRequestException(`${field} contains invalid values: ${invalid.join(', ')}`);
    }
    return values;
  }

  private parseDate(value: string | undefined, field: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private async generateUniqueCode(): Promise<string> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const code = await this.generateNextServiceOrderCode();
      const existing = await this.serviceOrderRepository.findOne({ where: { code }, withDeleted: true });
      if (!existing) return code;
    }
    throw new ConflictException('Could not generate a unique service order code');
  }

  private async generateNextServiceOrderCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const prefix = `SO${year}${month}${day}${hours}${minutes}`;

    const lastServiceOrder = await this.serviceOrderRepository
      .createQueryBuilder('serviceOrder')
      .withDeleted()
      .where('serviceOrder.code LIKE :pattern', { pattern: `${prefix}%` })
      .orderBy('serviceOrder.code', 'DESC')
      .limit(1)
      .getOne();

    if (!lastServiceOrder) {
      return `${prefix}0001`;
    }

    const current = Number(lastServiceOrder.code.slice(prefix.length));
    if (!Number.isFinite(current)) {
      return `${prefix}0001`;
    }

    return `${prefix}${String(current + 1).padStart(4, '0')}`;
  }
}
