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
import { Brackets, DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
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
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import {
  CreateServiceOrderBatchDto,
  CreateServiceOrderBatchEntryDto,
  CreateServiceOrderBatchSharedContextDto,
} from '../dto/create-service-order-batch.dto';
import { CreateServiceOrderDto } from '../dto/create-service-order.dto';
import { ServiceOrderTimeMetricsDto } from '../dto/service-order-time-metrics.dto';
import { UpdateServiceOrderDto } from '../dto/update-service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderMetricsFactory } from './service-order-metrics.factory';
import { ServiceOrderIntakePdfService } from '../documents/service-order-intake-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';
import { buildServiceOrderItemProgress } from './service-order-aggregate-projection.service';

type FindAllServiceOrdersQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  operativeStatus?: string;
  technicalStatus?: string;
  commercialStatus?: string;
  economicStatus?: string;
  clientId?: number | string;
  technicianId?: number | string;
  withDeleted?: string;
  from?: string;
  to?: string;
};

type ServiceOrderWithMetrics = ServiceOrder & {
  timeMetrics: ServiceOrderTimeMetricsDto;
  itemsCount: number;
  itemCodes: string[];
};

type ServiceOrderViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;
type ServiceOrderPersistenceContext = {
  manager?: EntityManager;
};

@Injectable()
export class ServiceOrderService {
  private readonly logger = new Logger(ServiceOrderService.name);

  constructor(
    private readonly dataSource: DataSource,
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

    const createdOrders = await this.dataSource.transaction(async (manager) => {
      const createdWithinTransaction: ServiceOrderWithMetrics[] = [];
      for (const orderEntry of dto.orders) {
        createdWithinTransaction.push(
          await this.createSingleOrderInternal(this.mergeBatchEntry(dto.sharedContext, orderEntry), creatorId, { manager }),
        );
      }

      return createdWithinTransaction;
    });

    await this.dispatchIntakeSummaryForOrders(createdOrders);

    return { createdOrders };
  }

  private async createSingleOrderInternal(
    dto: CreateServiceOrderDto,
    creatorId: number,
    context: ServiceOrderPersistenceContext = {},
  ): Promise<ServiceOrderWithMetrics> {
    const serviceOrderRepository = this.getRepository(ServiceOrder, context.manager);

    await this.ensureUser(creatorId, context.manager);
    const requestOrigin = dto.requestOrigin ?? RequestOrigin.CLIENT;
    const client = await this.resolveClientForRequest(dto.clientId, requestOrigin, context.manager);
    const clientContact = await this.resolveClientContactForOrder(client, dto.clientContactId, context.manager);
    const now = new Date();
    const assignedToTechnicianId = await this.resolveAssignedTechnicianId(
      dto.assignedToTechnicianId,
      dto.serviceType ?? ServiceType.DIAGNOSIS,
      context.manager,
    );

    const technicalStatus = this.getInitialTechnicalStatus(
      dto.serviceType ?? ServiceType.DIAGNOSIS,
      !!assignedToTechnicianId,
    );

    const maxCodeAttempts = 3;
    for (let attempt = 0; attempt < maxCodeAttempts; attempt += 1) {
      const code = await this.generateUniqueCode(context.manager);
      const serviceOrder = serviceOrderRepository.create({
        code,
        requestOrigin,
        clientId: client?.id ?? null,
        clientContactId: clientContact?.id ?? null,
        createdBy: creatorId,
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

      let saved: ServiceOrder;
      try {
        saved = await serviceOrderRepository.save(serviceOrder);
      } catch (error) {
        if (this.isServiceOrderCodeConflict(error) && attempt < maxCodeAttempts - 1) {
          continue;
        }
        throw error;
      }

      await this.workflowService.registerInitialAssignment(saved, creatorId, context.manager);
      return this.findOneByIdInternal(saved.id, context.manager);
    }

    throw new ConflictException('Could not persist service order with a unique code');
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
    const qb = this.serviceOrderRepository
      .createQueryBuilder('serviceOrder')
      .leftJoinAndSelect('serviceOrder.assignedTechnician', 'assignedTechnician')
      .leftJoinAndSelect('serviceOrder.client', 'client')
      .leftJoinAndSelect('serviceOrder.items', 'items');
    qb.leftJoinAndSelect('items.cancellationRequests', 'itemCancellationRequests');

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
            .orWhere('LOWER(items.code) LIKE :search')
            .orWhere('LOWER(items.serialNumber) LIKE :search')
            .orWhere('LOWER(items.initialIssue) LIKE :search')
            .orWhere('LOWER(items.brand) LIKE :search')
            .orWhere('LOWER(items.model) LIKE :search')
            .orWhere('LOWER(serviceOrder.clientSnapshotName) LIKE :search')
            .orWhere('LOWER(items.equipmentTypeOther) LIKE :search');
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
    const serviceOrder = await this.findOneByIdInternal(id, undefined, withDeleted);

    this.ensureViewerCanAccessOrder(serviceOrder, viewer);

    return serviceOrder;
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
      items: this.resolveOrderItems(serviceOrder).map((item) => ({
        position: item.position,
        code: item.code,
        priority: item.priority,
        equipmentType: item.equipmentTypeOther?.trim() || item.equipmentType,
        brand: item.brand ?? null,
        model: item.model ?? null,
        serialNumber: item.serialNumber ?? null,
        accessories: item.accessories ?? null,
        notes: item.notes ?? null,
        initialIssue: item.initialIssue,
      })),
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
      throw new BadRequestException('La orden no puede entregarse hasta cubrir totalmente su cotización vigente');
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
    manager?: EntityManager,
  ): Promise<number> {
    if (preferredTechnicianId) {
      await this.workflowService.ensureTechnicianAvailable(preferredTechnicianId);
      return preferredTechnicianId;
    }

    const suggestion = await this.workflowService.getAssignmentSuggestion(serviceType, manager);
    return suggestion.suggestedTechnicianId;
  }

  private async ensureExists(id: number) {
    const exists = await this.serviceOrderRepository.findOne({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }
  }

  private async ensureClient(id: number, manager?: EntityManager): Promise<Client> {
    const client = await this.getRepository(Client, manager).findOne({
      where: { id },
      relations: { documentType: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
    return client;
  }

  private async resolveClientForRequest(
    clientId: number | undefined,
    requestOrigin: RequestOrigin,
    manager?: EntityManager,
  ) {
    if (requestOrigin === RequestOrigin.INTERNAL) {
      return null;
    }
    if (!clientId) {
      throw new BadRequestException('clientId is required for client-origin service orders');
    }
    return this.ensureClient(clientId, manager);
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
    manager?: EntityManager,
  ): Promise<ClientContact | null> {
    const clientContactRepository = this.getRepository(ClientContact, manager);

    if (!client || client.kind !== ClientKind.COMPANY) {
      return null;
    }

    const normalizedContactId = Number(clientContactId || 0) || null;
    if (normalizedContactId) {
      const selectedContact = await clientContactRepository.findOne({
        where: { id: normalizedContactId, clientId: client.id },
      });
      if (!selectedContact) {
        throw new BadRequestException('clientContactId does not belong to the selected client');
      }
      return selectedContact;
    }

    const primaryContact = await clientContactRepository.findOne({
      where: { clientId: client.id, isPrimary: true, isActive: true },
    });
    if (primaryContact) {
      return primaryContact;
    }

    return clientContactRepository.findOne({
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

  private async ensureUser(id: number, manager?: EntityManager): Promise<User> {
    const user = await this.getRepository(User, manager).findOne({ where: { id } });
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

  private async generateUniqueCode(manager?: EntityManager): Promise<string> {
    const serviceOrderRepository = this.getRepository(ServiceOrder, manager);
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const code = await this.generateNextServiceOrderCode(manager);
      const existing = await serviceOrderRepository.findOne({ where: { code }, withDeleted: true });
      if (!existing) return code;
    }
    throw new ConflictException('Could not generate a unique service order code');
  }

  private async generateNextServiceOrderCode(manager?: EntityManager): Promise<string> {
    const serviceOrderRepository = this.getRepository(ServiceOrder, manager);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const prefix = `SO${year}${month}${day}${hours}${minutes}`;

    const lastServiceOrder = await serviceOrderRepository
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
    const items = this.resolveOrderItems(serviceOrder);
    const itemsWithSla = items.map((item) => {
      item.sla = this.metricsFactory.buildItemSla(item, serviceOrder);
      return item;
    });
    return Object.assign(serviceOrder, {
      timeMetrics: metrics.timeMetrics,
      items: itemsWithSla,
      itemsCount: itemsWithSla.length,
      itemCodes: itemsWithSla.map((item) => item.code),
      itemProgress: buildServiceOrderItemProgress(
        itemsWithSla.map((item) => ({
          ...item,
          operativeStatus: item.operativeStatus ?? serviceOrder.operativeStatus,
          technicalStatus: item.technicalStatus ?? serviceOrder.technicalStatus,
        })) as ServiceOrderItem[],
      ),
    }) as ServiceOrderWithMetrics;
  }

  private resolveOrderItems(serviceOrder: ServiceOrder) {
    if (serviceOrder.items?.length) {
      return [...serviceOrder.items].sort(
        (left, right) => left.position - right.position || left.code.localeCompare(right.code),
      );
    }
    return [];
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

  private getRepository<T extends ObjectLiteral>(target: EntityTarget<T>, manager?: EntityManager): Repository<T> {
    return manager ? manager.getRepository(target) : this.dataSource.getRepository(target);
  }

  private async findOneByIdInternal(
    id: number,
    manager?: EntityManager,
    withDeleted = false,
  ): Promise<ServiceOrderWithMetrics> {
    const serviceOrder = await this.getRepository(ServiceOrder, manager).findOne({
      where: { id },
      relations: ['assignedTechnician', 'client', 'items', 'items.cancellationRequests'],
      withDeleted,
    });

    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }

    return this.enrichWithMetrics(serviceOrder);
  }

  private isServiceOrderCodeConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const databaseError = error as { code?: string; errno?: number; message?: string };
    return (
      databaseError.code === 'ER_DUP_ENTRY' ||
      databaseError.errno === 1062 ||
      databaseError.message?.toLowerCase().includes('duplicate') === true
    );
  }
}
