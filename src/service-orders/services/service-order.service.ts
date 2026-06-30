import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { ClientContact } from '../../clients/entities/client-contact.entity';
import { Client } from '../../clients/entities/client.entity';
import { ClientKind } from '../../clients/entities/client-kind.enum';
import {
  normalizeComparablePhone as normalizeComparablePhoneValue,
  normalizePhoneToE164,
} from '../../common/utils/phone.util';
import { User } from '../../users/entities/user.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import {
  EquipmentType,
  RequestOrigin,
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import {
  CreateServiceOrderBatchDto,
  CreateServiceOrderBatchEntryDto,
  CreateServiceOrderBatchSharedContextDto,
} from '../dto/create-service-order-batch.dto';
import { CreateServiceOrderDto } from '../dto/create-service-order.dto';
import { ServiceOrderSlaDto } from '../dto/service-order-sla.dto';
import { ServiceOrderTimeMetricsDto } from '../dto/service-order-time-metrics.dto';
import { UpdateServiceOrderDto } from '../dto/update-service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderMetricsFactory } from './service-order-metrics.factory';
import { ServiceOrderIntakePdfService } from '../documents/service-order-intake-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';

type FindAllServiceOrdersQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  operativeStatus?: string;
  technicalStatus?: string;
  commercialStatus?: string;
  economicStatus?: string;
  priority?: string;
  clientId?: number | string;
  technicianId?: number | string;
  withDeleted?: string;
  from?: string;
  to?: string;
};

type ServiceOrderWithMetrics = ServiceOrder & {
  sla: ServiceOrderSlaDto;
  timeMetrics: ServiceOrderTimeMetricsDto;
};

type ServiceOrderViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderService {
  private readonly logger = new Logger(ServiceOrderService.name);

  constructor(
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ClientContact)
    private readonly clientContactRepository: Repository<ClientContact>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ServiceOrderEvent)
    private readonly eventRepository: Repository<ServiceOrderEvent>,
    private readonly workflowService: ServiceOrderWorkflowService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly metricsFactory: ServiceOrderMetricsFactory,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly intakePdfService: ServiceOrderIntakePdfService,
    private readonly configService: ConfigService,
    private readonly inboxService: ServiceOrderInboxService,
  ) {}

  async create(dto: CreateServiceOrderDto, creatorId: number): Promise<ServiceOrderWithMetrics> {
    const createdOrder = await this.createSingleOrderInternal(dto, creatorId);
    await this.dispatchIntakeSummaryForOrders([createdOrder]);
    return createdOrder;
  }

  async createBatch(
    dto: CreateServiceOrderBatchDto,
    creatorId: number,
  ): Promise<{ createdOrders: ServiceOrderWithMetrics[] }> {
    if (!dto.orders?.length) {
      throw new BadRequestException('At least one order is required');
    }

    await this.preflightBatchCreateOrThrow(dto, creatorId);

    const createdOrders: ServiceOrderWithMetrics[] = [];
    for (const orderEntry of dto.orders) {
      createdOrders.push(
        await this.createSingleOrderInternal(this.mergeBatchEntry(dto.sharedContext, orderEntry), creatorId),
      );
    }

    await this.dispatchIntakeSummaryForOrders(createdOrders);

    return { createdOrders };
  }

  private async createSingleOrderInternal(
    dto: CreateServiceOrderDto,
    creatorId: number,
  ): Promise<ServiceOrderWithMetrics> {
    await this.ensureUser(creatorId);
    const requestOrigin = dto.requestOrigin ?? RequestOrigin.CLIENT;
    const client = await this.resolveClientForRequest(dto.clientId, requestOrigin);
    const clientContact = await this.resolveClientContactForOrder(client, dto.clientContactId);
    const code = await this.generateUniqueCode();
    const now = new Date();
    const assignedToTechnicianId = await this.resolveAssignedTechnicianId(
      dto.assignedToTechnicianId,
      dto.serviceType ?? ServiceType.DIAGNOSIS,
    );

    const technicalStatus = this.getInitialTechnicalStatus(
      dto.serviceType ?? ServiceType.DIAGNOSIS,
      !!assignedToTechnicianId,
    );

    const serviceOrder = this.serviceOrderRepository.create({
      code,
      requestOrigin,
      clientId: client?.id ?? null,
      clientContactId: clientContact?.id ?? null,
      createdBy: creatorId,
      priority: dto.priority ?? ServiceOrderPriority.MEDIUM,
      operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
      technicalStatus,
      commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
      economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
      montoComprometidoVigente: 0,
      montoReconciliado: 0,
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
    this.applyContactSnapshotOverrides(serviceOrder, dto, clientContact);
    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.workflowService.registerInitialAssignment(saved, creatorId);
    return this.findOne(saved.id);
  }

  async findAll(query: FindAllServiceOrdersQuery, viewer?: ServiceOrderViewer) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';

    const operativeStatuses = this.parseEnumList<ServiceOrderOperativeStatus>(
      query.operativeStatus,
      ServiceOrderOperativeStatus,
      'operativeStatus',
    );
    const technicalStatuses = this.parseEnumList<ServiceOrderTechnicalStatus>(
      query.technicalStatus,
      ServiceOrderTechnicalStatus,
      'technicalStatus',
    );
    const commercialStatuses = this.parseEnumList<ServiceOrderCommercialStatus>(
      query.commercialStatus,
      ServiceOrderCommercialStatus,
      'commercialStatus',
    );
    const economicStatuses = this.parseEnumList<ServiceOrderEconomicStatus>(
      query.economicStatus,
      ServiceOrderEconomicStatus,
      'economicStatus',
    );
    const priorities = this.parseEnumList<ServiceOrderPriority>(query.priority, ServiceOrderPriority, 'priority');

    const qb = this.serviceOrderRepository
      .createQueryBuilder('serviceOrder')
      .leftJoinAndSelect('serviceOrder.assignedTechnician', 'assignedTechnician')
      .leftJoinAndSelect('serviceOrder.client', 'client');

    if (includeDeleted) {
      qb.withDeleted();
    }
    if (operativeStatuses?.length) {
      qb.andWhere('serviceOrder.operativeStatus IN (:...operativeStatuses)', {
        operativeStatuses,
      });
    }
    if (technicalStatuses?.length) {
      qb.andWhere('serviceOrder.technicalStatus IN (:...technicalStatuses)', {
        technicalStatuses,
      });
    }
    if (commercialStatuses?.length) {
      qb.andWhere('serviceOrder.commercialStatus IN (:...commercialStatuses)', { commercialStatuses });
    }
    if (economicStatuses?.length) {
      qb.andWhere('serviceOrder.economicStatus IN (:...economicStatuses)', { economicStatuses });
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
    this.applyViewerScope(qb, viewer);

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
    return { data: data.map((serviceOrder) => this.enrichWithMetrics(serviceOrder)), total, page, limit };
  }

  async findOne(id: number, withDeleted = false, viewer?: ServiceOrderViewer): Promise<ServiceOrderWithMetrics> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id },
      relations: ['assignedTechnician', 'client'],
      withDeleted,
    });

    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }

    this.ensureViewerCanAccessOrder(serviceOrder, viewer);

    return this.enrichWithMetrics(serviceOrder);
  }

  async generateSingleOrderSummaryPdf(
    id: number,
    viewer?: ServiceOrderViewer,
  ): Promise<{ fileName: string; buffer: Buffer; mimeType: string }> {
    const serviceOrder = await this.findOne(id, false, viewer);
    const buffer = await this.intakePdfService.generateSingleOrderSummaryBuffer({
      code: serviceOrder.code,
      createdAt: serviceOrder.createdAt ?? new Date(),
      operativeStatus: serviceOrder.operativeStatus,
      serviceType: serviceOrder.serviceType,
      clientName: serviceOrder.clientSnapshotName ?? serviceOrder.client?.name ?? null,
      clientDocument:
        [serviceOrder.clientSnapshotDocumentTypeName, serviceOrder.clientSnapshotDocumentNumber]
          .filter(Boolean)
          .join(': ') || null,
      clientPhone: serviceOrder.clientSnapshotPhone ?? serviceOrder.client?.phone ?? null,
      clientEmail: serviceOrder.clientSnapshotEmail ?? serviceOrder.client?.email ?? null,
      equipmentType: serviceOrder.equipmentTypeOther?.trim() || serviceOrder.equipmentType,
      brand: serviceOrder.brand ?? null,
      model: serviceOrder.model ?? null,
      serialNumber: serviceOrder.serialNumber ?? null,
      accessories: serviceOrder.accessories ?? null,
      notes: serviceOrder.notes ?? null,
      initialIssue: serviceOrder.initialIssue,
    });

    return {
      fileName: `${serviceOrder.code}-resumen.pdf`,
      buffer,
      mimeType: 'application/pdf',
    };
  }

  async update(id: number, dto: UpdateServiceOrderDto, viewer?: ServiceOrderViewer): Promise<ServiceOrderWithMetrics> {
    if ('operativeStatus' in dto) {
      throw new BadRequestException('operativeStatus ya no se puede modificar por update; usa el workflow correspondiente');
    }
    if ('serviceType' in dto) {
      throw new BadRequestException('serviceType ya no se puede modificar por update; usa un flujo dedicado');
    }
    if ('assignedToTechnicianId' in dto) {
      throw new BadRequestException('assignedToTechnicianId ya no se puede modificar por update; usa assign-technician');
    }

    const serviceOrder = await this.findOne(id, false, viewer);
    const previousOperativeStatus = serviceOrder.operativeStatus;
    const previousNormalizedClientPhone = this.normalizeComparablePhone(serviceOrder.clientSnapshotPhone);

    if (dto.requestOrigin !== undefined || dto.clientId !== undefined) {
      const requestOrigin = dto.requestOrigin ?? serviceOrder.requestOrigin ?? RequestOrigin.CLIENT;
      serviceOrder.requestOrigin = requestOrigin;
      const client = await this.resolveClientForRequest(
        dto.clientId ?? serviceOrder.clientId ?? undefined,
        requestOrigin,
      );
      serviceOrder.clientId = client?.id ?? null;
      serviceOrder.clientContactId = null;
      this.applyClientSnapshot(serviceOrder, client);
    }

    const effectiveClient =
      serviceOrder.clientId != null
        ? await this.clientRepository.findOne({
            where: { id: serviceOrder.clientId },
            relations: ['documentType', 'contacts'],
          })
        : null;
    const clientContact = await this.resolveClientContactForOrder(
      effectiveClient,
      dto.clientContactId ?? serviceOrder.clientContactId ?? undefined,
    );
    serviceOrder.clientContactId = clientContact?.id ?? null;

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
    this.applyContactSnapshotOverrides(serviceOrder, dto, clientContact);

    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.syncInboxThreadClientPhoneSnapshotIfNeeded(saved.id, previousNormalizedClientPhone, saved.clientSnapshotPhone);
    if (
      previousOperativeStatus !== ServiceOrderOperativeStatus.ENTREGADA &&
      saved.operativeStatus === ServiceOrderOperativeStatus.ENTREGADA
    ) {
      await this.messageMatrixService.notifySurveyRequest(saved);
    }
    return this.enrichWithMetrics(saved);
  }

  async markAsDelivered(id: number, actorId?: number, viewer?: ServiceOrderViewer): Promise<ServiceOrderWithMetrics> {
    const serviceOrder = await this.findOne(id, false, viewer);
    const previousOperativeStatus = serviceOrder.operativeStatus;

    if (serviceOrder.operativeStatus !== ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA) {
      throw new BadRequestException('Solo se pueden entregar ordenes listas para entrega');
    }

    const totalCommitted = Number(serviceOrder.montoComprometidoVigente ?? 0);
    const totalReconciled = Number(serviceOrder.montoReconciliado ?? 0);
    if (totalCommitted > 0 && totalReconciled + 0.01 < totalCommitted) {
      throw new BadRequestException('La orden no puede entregarse hasta cubrir totalmente su acuerdo vigente');
    }

    serviceOrder.operativeStatus = ServiceOrderOperativeStatus.ENTREGADA;
    serviceOrder.deliveredAt = serviceOrder.deliveredAt ?? new Date();

    const saved = await this.serviceOrderRepository.save(serviceOrder);
    await this.recordOperativeEvent(
      saved.id,
      'operative.delivered',
      previousOperativeStatus,
      ServiceOrderOperativeStatus.ENTREGADA,
      actorId,
      { deliveredAt: saved.deliveredAt?.toISOString() ?? null },
    );
    await this.messageMatrixService.notifySurveyRequest(saved);
    return this.enrichWithMetrics(saved);
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

  private getInitialTechnicalStatus(serviceType: ServiceType, hasAssignedTechnician: boolean): ServiceOrderTechnicalStatus {
    if (!hasAssignedTechnician) {
      return ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION;
    }

    if ([ServiceType.STANDARD_SERVICE, ServiceType.ASSEMBLY].includes(serviceType)) {
      return ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION;
    }

    return ServiceOrderTechnicalStatus.ASIGNADA;
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

  private applyContactSnapshotOverrides(
    serviceOrder: ServiceOrder,
    dto: Pick<CreateServiceOrderDto, 'contactName' | 'contactEmail' | 'contactPhone'>,
    clientContact?: ClientContact | null,
  ): void {
    if (clientContact) {
      serviceOrder.clientSnapshotName = clientContact.name ?? serviceOrder.clientSnapshotName;
      serviceOrder.clientSnapshotEmail = clientContact.email ?? null;
      serviceOrder.clientSnapshotPhone = clientContact.phone ?? null;
    } else if (!serviceOrder.clientId) {
      serviceOrder.clientContactId = null;
    }

    if (dto.contactName !== undefined) {
      serviceOrder.clientSnapshotName = this.normalizeOptionalValue(dto.contactName, 150);
    }
    if (dto.contactEmail !== undefined) {
      serviceOrder.clientSnapshotEmail = this.normalizeOptionalValue(dto.contactEmail, 150);
    }
    if (dto.contactPhone !== undefined) {
      serviceOrder.clientSnapshotPhone = this.normalizePhoneSnapshot(dto.contactPhone);
    }
  }

  private mergeBatchEntry(
    sharedContext: CreateServiceOrderBatchSharedContextDto,
    orderEntry: CreateServiceOrderBatchEntryDto,
  ): CreateServiceOrderDto {
    return {
      requestOrigin: sharedContext.requestOrigin,
      clientId: sharedContext.clientId,
      clientContactId: sharedContext.clientContactId,
      priority: sharedContext.priority,
      assignedToTechnicianId: sharedContext.assignedToTechnicianId,
      contactName: sharedContext.contactName,
      contactEmail: sharedContext.contactEmail,
      contactPhone: sharedContext.contactPhone,
      equipmentType: orderEntry.equipmentType,
      equipmentTypeOther: orderEntry.equipmentTypeOther,
      brand: orderEntry.brand,
      model: orderEntry.model,
      serialNumber: orderEntry.serialNumber,
      initialIssue: orderEntry.initialIssue,
      accessories: orderEntry.accessories,
      serviceType: orderEntry.serviceType,
      estimatedRepairHours: orderEntry.estimatedRepairHours,
      estimatedDeliveryDate: orderEntry.estimatedDeliveryDate,
      notes: orderEntry.notes,
    };
  }

  private async preflightBatchCreateOrThrow(
    dto: CreateServiceOrderBatchDto,
    creatorId: number,
  ): Promise<void> {
    await this.ensureUser(creatorId);

    const requestOrigin = dto.sharedContext.requestOrigin ?? RequestOrigin.CLIENT;
    const client = await this.resolveClientForRequest(dto.sharedContext.clientId, requestOrigin);
    await this.resolveClientContactForOrder(client, dto.sharedContext.clientContactId);

    if (dto.sharedContext.assignedToTechnicianId) {
      await this.workflowService.ensureTechnicianAvailable(dto.sharedContext.assignedToTechnicianId);
      return;
    }

    const checkedServiceTypes = new Set<ServiceType>();
    for (const orderEntry of dto.orders) {
      const serviceType = orderEntry.serviceType ?? ServiceType.DIAGNOSIS;
      if (checkedServiceTypes.has(serviceType)) {
        continue;
      }
      await this.resolveAssignedTechnicianId(undefined, serviceType);
      checkedServiceTypes.add(serviceType);
    }
  }

  private async resolveClientContactForOrder(
    client: Client | null,
    clientContactId?: number | null,
  ): Promise<ClientContact | null> {
    if (!client || client.kind !== ClientKind.COMPANY) {
      return null;
    }

    const normalizedContactId = Number(clientContactId || 0) || null;
    if (normalizedContactId) {
      const selectedContact = await this.clientContactRepository.findOne({
        where: { id: normalizedContactId, clientId: client.id },
      });
      if (!selectedContact) {
        throw new BadRequestException('clientContactId does not belong to the selected client');
      }
      return selectedContact;
    }

    const primaryContact = await this.clientContactRepository.findOne({
      where: { clientId: client.id, isPrimary: true, isActive: true },
    });
    if (primaryContact) {
      return primaryContact;
    }

    return this.clientContactRepository.findOne({
      where: { clientId: client.id, isActive: true },
      order: { id: 'ASC' },
    });
  }

  private normalizeOptionalValue(value: string | null | undefined, maxLength: number): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private normalizePhoneSnapshot(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = normalizePhoneToE164(value);
    if (!normalized) {
      throw new BadRequestException('contactPhone must be a valid E.164 phone number');
    }

    return normalized;
  }

  private normalizeComparablePhone(phone: string | null | undefined): string | null {
    return normalizeComparablePhoneValue(phone) ?? null;
  }

  private async syncInboxThreadClientPhoneSnapshotIfNeeded(
    serviceOrderId: number,
    previousPhone: string | null,
    nextPhone: string | null | undefined,
  ): Promise<void> {
    const normalizedNextPhone = this.normalizeComparablePhone(nextPhone);
    if (normalizedNextPhone === previousPhone) {
      return;
    }

    await this.inboxService.syncThreadClientPhoneSnapshotForOrder(serviceOrderId, normalizedNextPhone);
  }

  private async recordOperativeEvent(
    serviceOrderId: number,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    actorId?: number,
    payloadJson?: Record<string, unknown> | null,
  ): Promise<void> {
    await this.eventRepository.save(
      this.eventRepository.create({
        serviceOrderId,
        eventType,
        axis: 'operativo',
        capability: 'delivery',
        fromStatus,
        toStatus,
        actorId: actorId ?? null,
        reason: null,
        payloadJson: payloadJson ?? null,
      }),
    );
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

  private enrichWithMetrics(serviceOrder: ServiceOrder): ServiceOrderWithMetrics {
    const metrics = this.metricsFactory.build(serviceOrder);
    return Object.assign(serviceOrder, {
      sla: metrics.sla,
      timeMetrics: metrics.timeMetrics,
    }) as ServiceOrderWithMetrics;
  }

  private async dispatchIntakeSummaryForOrders(serviceOrders: ServiceOrderWithMetrics[]): Promise<void> {
    const orders = serviceOrders.filter(Boolean);
    if (!orders.length) {
      return;
    }

    const recipient = orders[0].clientSnapshotPhone?.trim() || null;
    if (!recipient) {
      return;
    }

    try {
      const generatedPdf = await this.intakePdfService.generate({
        clientName: orders[0].clientSnapshotName ?? null,
        createdAt: orders[0].createdAt ?? new Date(),
        orders: orders.map((order) => ({
          code: order.code,
          serviceType: order.serviceType,
          equipmentLabel: this.buildEquipmentLabel(order),
          technicianName: order.assignedTechnician?.name ?? null,
          initialIssue: order.initialIssue,
          estimatedDeliveryDate: order.estimatedDeliveryDate?.toISOString() ?? null,
          notes: order.notes ?? null,
        })),
      });

      const tempDocument = await this.tempDocumentsService.createRecord({
        sourceType: 'ORDER_INTAKE_SUMMARY',
        mimeType: generatedPdf.mimeType,
        fileName: generatedPdf.fileName,
        absolutePath: generatedPdf.absolutePath,
        metadata: {
          orderIds: orders.map((order) => order.id),
          recipient,
          templateName:
            this.configService.get<string>('WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME') ||
            'ordenes_ingresadas_asignadas',
        },
      });

      const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(
        /\/+$/,
        '',
      );
      await this.messageMatrixService.dispatchOrderIntakeTemplate({
        serviceOrders: orders,
        documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
        documentFileName: generatedPdf.fileName,
        tempDocumentToken: tempDocument.token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch preparation error';
      this.logger.error(
        `Failed to prepare intake summary dispatch for orders ${orders.map((order) => order.id).join(', ')}: ${message}`,
      );
    }
  }

  private buildEquipmentLabel(serviceOrder: ServiceOrder): string {
    const parts = [
      serviceOrder.equipmentTypeOther?.trim() || null,
      serviceOrder.brand?.trim() || null,
      serviceOrder.model?.trim() || null,
    ].filter(Boolean);

    if (parts.length) {
      return parts.join(' ');
    }

    return serviceOrder.equipmentType;
  }

  private applyViewerScope(qb: any, viewer?: ServiceOrderViewer): void {
    if (!this.isTechnicianViewer(viewer)) {
      return;
    }

    const technicianId = Number(viewer?.sub ?? 0);
    if (!technicianId) {
      throw new ForbiddenException('Usuario tecnico no identificado');
    }

    qb.andWhere('serviceOrder.assignedToTechnicianId = :viewerTechnicianId', {
      viewerTechnicianId: technicianId,
    });
  }

  private ensureViewerCanAccessOrder(serviceOrder: ServiceOrder, viewer?: ServiceOrderViewer): void {
    if (!this.isTechnicianViewer(viewer)) {
      return;
    }

    const technicianId = Number(viewer?.sub ?? 0);
    if (!technicianId) {
      throw new ForbiddenException('Usuario tecnico no identificado');
    }

    if (Number(serviceOrder.assignedToTechnicianId) !== technicianId) {
      throw new ForbiddenException('No tienes acceso a esta orden de servicio');
    }
  }

  private isTechnicianViewer(viewer?: ServiceOrderViewer): boolean {
    return isTechnicianScopedRoleSet(viewer?.roles);
  }
}
