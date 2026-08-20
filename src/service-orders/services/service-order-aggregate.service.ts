import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientContact } from '../../clients/entities/client-contact.entity';
import { ClientKind } from '../../clients/entities/client-kind.enum';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { CreateServiceOrderAggregateDto, CreateServiceOrderItemDto } from '../dto/create-service-order-aggregate.dto';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
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
import { ServiceOrderCodeService } from './service-order-code.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';
import { ServiceOrderInitialCommercialService } from './service-order-initial-commercial.service';
import { buildServiceOrderItemProgress } from './service-order-aggregate-projection.service';

@Injectable()
export class ServiceOrderAggregateService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly codeService: ServiceOrderCodeService,
    private readonly workflowService: ServiceOrderWorkflowService,
    private readonly initialCommercialService: ServiceOrderInitialCommercialService,
  ) {}

  async create(dto: CreateServiceOrderAggregateDto, creatorId: number): Promise<ServiceOrder> {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one service-order item is required');
    }
    return this.dataSource.transaction(async (manager) => this.createInTransaction(manager, dto, creatorId));
  }

  private async createInTransaction(
    manager: EntityManager,
    dto: CreateServiceOrderAggregateDto,
    creatorId: number,
  ): Promise<ServiceOrder> {
    const orderRepository = manager.getRepository(ServiceOrder);
    const itemRepository = manager.getRepository(ServiceOrderItem);
    const creator = await manager.getRepository(User).findOne({ where: { id: creatorId } });
    if (!creator || creator.deletedAt) {
      throw new NotFoundException(`User with id ${creatorId} not found or inactive`);
    }

    await this.workflowService.ensureTechnicianAvailable(dto.assignedToTechnicianId);
    const requestOrigin = dto.requestOrigin ?? RequestOrigin.CLIENT;
    const client = await this.resolveClient(manager, dto.clientId, requestOrigin);
    const contact = await this.resolveContact(manager, client, dto.clientContactId);
    const codes = await this.codeService.allocate(manager, dto.items.length);
    const now = new Date();
    const firstItem = dto.items[0];
    const isDirectService = [ServiceType.STANDARD_SERVICE, ServiceType.ASSEMBLY].includes(dto.serviceType);
    const technicalStatus = isDirectService
      ? ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION
      : ServiceOrderTechnicalStatus.ASIGNADA;
    const commercialStatus = this.getInitialCommercialStatus(dto.serviceType);

    const order = orderRepository.create({
      code: codes.parentCode,
      requestOrigin,
      clientId: client?.id ?? null,
      clientContactId: contact?.id ?? null,
      createdBy: creatorId,
      assignedToTechnicianId: dto.assignedToTechnicianId,
      assignedAt: now,
      serviceType: dto.serviceType,
      operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
      technicalStatus,
      commercialStatus,
      economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
      montoComprometidoVigente: 0,
      montoReconciliado: 0,
      receivedAt: now,
      notes: dto.notes ?? null,
      // Proyección de compatibilidad para datos de equipo hasta que los lectores legacy consuman items[].
      equipmentType: firstItem.equipmentType,
      equipmentTypeOther: this.resolveEquipmentTypeOther(firstItem),
      brand: firstItem.brand ?? null,
      model: firstItem.model ?? null,
      serialNumber: firstItem.serialNumber ?? null,
      accessories: firstItem.accessories ?? null,
      initialIssue: firstItem.initialIssue,
      estimatedRepairHours: firstItem.estimatedRepairHours ?? null,
      estimatedDeliveryDate: firstItem.estimatedDeliveryDate ? new Date(firstItem.estimatedDeliveryDate) : null,
    });
    this.applyClientSnapshot(order, client, contact, dto);
    const savedOrder = await orderRepository.save(order);

    const items = dto.items.map((item, index) =>
      itemRepository.create({
        serviceOrderId: savedOrder.id,
        position: index + 1,
        code: codes.itemCodes[index],
        equipmentType: item.equipmentType,
        equipmentTypeOther: this.resolveEquipmentTypeOther(item),
        brand: item.brand ?? null,
        model: item.model ?? null,
        serialNumber: item.serialNumber ?? null,
        serialNumberNormalized: this.normalizeSerial(item.serialNumber),
        accessories: item.accessories ?? null,
        initialIssue: item.initialIssue,
        notes: item.notes ?? null,
        priority: item.priority ?? ServiceOrderPriority.LOW,
        operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
        technicalStatus,
        commercialStatus,
        estimatedRepairHours: item.estimatedRepairHours ?? null,
        estimatedDeliveryDate: item.estimatedDeliveryDate ? new Date(item.estimatedDeliveryDate) : null,
        reviewStartedAt: null,
        serviceStartedAt: null,
        serviceCompletedAt: null,
        readyForPickupAt: null,
        resolvedAt: null,
        deliveredAt: null,
        cancelledAt: null,
        cancellationReason: null,
        warrantySourceItemId: null,
      }),
    );
    const savedItems = await itemRepository.save(items);
    if (isDirectService) {
      await this.initialCommercialService.createForDirectService(manager, savedOrder, savedItems, dto.items, creatorId);
    }
    await this.workflowService.registerInitialAssignment(savedOrder, creatorId, manager);

    const reloaded = await orderRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['assignedTechnician', 'client', 'items'],
    });
    if (!reloaded) {
      throw new NotFoundException(`ServiceOrder with id ${savedOrder.id} not found after creation`);
    }
    reloaded.itemProgress = buildServiceOrderItemProgress(reloaded.items ?? []);
    return reloaded;
  }

  private async resolveClient(
    manager: EntityManager,
    clientId: number | undefined,
    requestOrigin: RequestOrigin,
  ): Promise<Client | null> {
    if (requestOrigin === RequestOrigin.INTERNAL) return null;
    if (!clientId) throw new BadRequestException('clientId is required for client-origin service orders');
    const client = await manager.getRepository(Client).findOne({
      where: { id: clientId },
      relations: { documentType: true },
    });
    if (!client) throw new NotFoundException(`Client with id ${clientId} not found`);
    return client;
  }

  private async resolveContact(
    manager: EntityManager,
    client: Client | null,
    clientContactId?: number,
  ): Promise<ClientContact | null> {
    if (!client || client.kind !== ClientKind.COMPANY) return null;
    const repository = manager.getRepository(ClientContact);
    if (clientContactId) {
      const contact = await repository.findOne({ where: { id: clientContactId, clientId: client.id } });
      if (!contact) throw new BadRequestException('clientContactId does not belong to the selected client');
      return contact;
    }
    return (
      (await repository.findOne({ where: { clientId: client.id, isPrimary: true, isActive: true } })) ??
      (await repository.findOne({ where: { clientId: client.id, isActive: true }, order: { id: 'ASC' } }))
    );
  }

  private applyClientSnapshot(
    order: ServiceOrder,
    client: Client | null,
    contact: ClientContact | null,
    dto: CreateServiceOrderAggregateDto,
  ): void {
    order.clientSnapshotName = dto.contactName ?? contact?.name ?? client?.name ?? null;
    order.clientSnapshotDocumentTypeName = client?.documentType?.name ?? null;
    order.clientSnapshotDocumentNumber = client?.documentNumber ?? null;
    order.clientSnapshotPhone = dto.contactPhone ?? contact?.phone ?? client?.phone ?? null;
    order.clientSnapshotEmail = dto.contactEmail ?? contact?.email ?? client?.email ?? null;
  }

  private getInitialCommercialStatus(serviceType: ServiceType): ServiceOrderCommercialStatus {
    return [ServiceType.STANDARD_SERVICE, ServiceType.ASSEMBLY].includes(serviceType)
      ? ServiceOrderCommercialStatus.AUTORIZADA
      : ServiceOrderCommercialStatus.NO_REQUIERE;
  }

  private resolveEquipmentTypeOther(item: CreateServiceOrderItemDto): string | null {
    return item.equipmentType === EquipmentType.OTHER ? item.equipmentTypeOther?.trim() ?? null : null;
  }

  private normalizeSerial(value: string | undefined): string | null {
    const normalized = value?.trim().toUpperCase() ?? '';
    return normalized || null;
  }
}
