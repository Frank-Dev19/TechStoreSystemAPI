import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { SaleStatus } from '../../sales/enums/sale-status.enum';
import { RequestServiceOrderItemCancellationDto } from '../dto/request-service-order-item-cancellation.dto';
import { RequestServiceOrderItemsCancellationDto } from '../dto/request-service-order-items-cancellation.dto';
import { ResolveServiceOrderItemCancellationDto } from '../dto/resolve-service-order-item-cancellation.dto';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItemCancellationRequest } from '../entities/service-order-item-cancellation-request.entity';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderSaleLink } from '../entities/service-order-sale-link.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCancellationResolution,
  ServiceOrderCancellationStatus,
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderAggregateProjectionService } from './service-order-aggregate-projection.service';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementItem } from '../service-agreements/entities/service-agreement-item.entity';
import { ServiceOrderAgreementSource } from '../service-agreements/service-agreement-source.enum';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';

type CancellationViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

const DIAGNOSIS_CANCELLATION_FEE = 20;

@Injectable()
export class ServiceOrderItemCancellationService {
  constructor(
    private readonly manager: EntityManager,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
  ) {}

  async requestCancellations(
    serviceOrderId: number,
    dto: RequestServiceOrderItemsCancellationDto,
    actorId?: number,
    viewer?: CancellationViewer,
  ) {
    const requesterId = this.requireActor(actorId);
    return this.manager.transaction(async (manager) => {
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException(
          `ServiceOrder with id ${serviceOrderId} not found`,
        );
      }
      this.ensureViewerCanManageOrder(order, viewer);

      const itemIds = [...new Set(dto.itemIds.map(Number))];
      const itemRepository = manager.getRepository(ServiceOrderItem);
      const items = await itemRepository.find({
        where: { id: In(itemIds), serviceOrderId },
        order: { position: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (items.length !== itemIds.length) {
        throw new BadRequestException(
          'Uno o más equipos no pertenecen a la orden indicada',
        );
      }
      items.forEach((item) => this.assertItemCanReceiveRequest(item));

      const requestRepository = manager.getRepository(
        ServiceOrderItemCancellationRequest,
      );
      const activeRequests = await requestRepository.find({
        where: {
          serviceOrderItemId: In(itemIds),
          status: In([
            ServiceOrderCancellationStatus.PENDING,
            ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
          ]),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (activeRequests.length) {
        throw new BadRequestException(
          'Al menos uno de los equipos ya tiene una solicitud de cancelación pendiente',
        );
      }

      const chargedItems = items.filter((item) =>
        this.hasDiagnosisStarted(item),
      );
      if (chargedItems.length && dto.customerChargeAcknowledged !== true) {
        throw new BadRequestException(
          'Debes confirmar que el cliente fue informado del cargo de S/ 20 por cada equipo cuyo diagnóstico ya inició',
        );
      }
      await this.assertNoConfirmedSale(manager, order.id);

      const now = new Date();
      const reason = dto.reason.trim();
      const commercialVersions = new Map<
        number,
        ServiceOrderItemCommercialVersion
      >();
      for (const item of chargedItems) {
        commercialVersions.set(
          Number(item.id),
          await this.createImmediateCancellationCharge(
            manager,
            item,
            requesterId,
            reason,
            now,
          ),
        );
      }

      const requests: ServiceOrderItemCancellationRequest[] = [];
      for (const item of items) {
        const commercialVersion = commercialVersions.get(Number(item.id));
        const request = await requestRepository.save(
          requestRepository.create({
            serviceOrderItemId: item.id,
            status: ServiceOrderCancellationStatus.APPROVED,
            resolution: commercialVersion
              ? ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE
              : ServiceOrderCancellationResolution.APPROVED_WITHOUT_CHARGE,
            channel: dto.channel,
            reason,
            requestedByUserId: requesterId,
            requestedAt: now,
            previousOperativeStatus: item.operativeStatus,
            previousTechnicalStatus: item.technicalStatus,
            resolvedByUserId: requesterId,
            resolvedAt: now,
            resolutionReason: reason,
            chargeAmount: commercialVersion
              ? DIAGNOSIS_CANCELLATION_FEE
              : null,
            commercialVersionId: commercialVersion?.id ?? null,
          }),
        );
        const previousStatus = item.operativeStatus;
        this.applyCancellation(item, reason, now);
        await itemRepository.save(item);
        await this.recordEvent(
          manager,
          order.id,
          item,
          'item.cancellation.approved',
          previousStatus,
          item.operativeStatus,
          requesterId,
          reason,
          request.id,
          request.status,
        );
        requests.push(request);
      }

      let agreement: ServiceOrderAgreement | null = null;
      if (commercialVersions.size) {
        agreement = await this.createConfirmedCancellationAgreement(
          manager,
          order,
          items.filter((item) => commercialVersions.has(Number(item.id))),
          commercialVersions,
          requesterId,
          reason,
          now,
        );
      }

      const projectedOrder = await this.projectionService.recalculateLocked(
        manager,
        order.id,
      );
      return {
        requests,
        order: projectedOrder,
        agreement,
        chargedItemsCount: chargedItems.length,
        chargeTotal: Number(
          (chargedItems.length * DIAGNOSIS_CANCELLATION_FEE).toFixed(2),
        ),
      };
    });
  }

  async requestCancellation(
    serviceOrderId: number,
    itemId: number,
    dto: RequestServiceOrderItemCancellationDto,
    actorId?: number,
    viewer?: CancellationViewer,
  ) {
    return this.requestCancellations(
      serviceOrderId,
      {
        itemIds: [itemId],
        channel: dto.channel,
        reason: dto.reason,
        customerChargeAcknowledged: dto.customerChargeAcknowledged,
      },
      actorId,
      viewer,
    ).then((result) => ({
      request: result.requests[0],
      order: result.order,
    }));
  }

  async resolveCancellation(
    serviceOrderId: number,
    itemId: number,
    requestId: number,
    dto: ResolveServiceOrderItemCancellationDto,
    actorId?: number,
    viewer?: CancellationViewer,
  ) {
    const resolverId = this.requireActor(actorId);
    return this.manager.transaction(async (manager) => {
      const { order, item } = await this.loadLockedContext(
        manager,
        serviceOrderId,
        itemId,
        viewer,
      );
      const requestRepository = manager.getRepository(
        ServiceOrderItemCancellationRequest,
      );
      const request = await requestRepository.findOne({
        where: { id: requestId, serviceOrderItemId: item.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request)
        throw new NotFoundException(
          `Cancellation request with id ${requestId} not found`,
        );
      if (request.status !== ServiceOrderCancellationStatus.PENDING) {
        throw new BadRequestException(
          'La solicitud de cancelación ya fue resuelta',
        );
      }
      if (
        item.operativeStatus !==
        ServiceOrderOperativeStatus.CANCELACION_SOLICITADA
      ) {
        throw new BadRequestException(
          'El equipo ya no está esperando una resolución de cancelación',
        );
      }
      const previousStatus = item.operativeStatus;
      const now = new Date();
      request.resolution = dto.resolution;
      request.resolvedByUserId = resolverId;
      request.resolvedAt = now;
      request.resolutionReason = dto.reason.trim();

      if (dto.resolution === ServiceOrderCancellationResolution.REJECTED) {
        request.status = ServiceOrderCancellationStatus.REJECTED;
        item.operativeStatus = request.previousOperativeStatus;
      } else if (
        dto.resolution ===
        ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE
      ) {
        const chargeAmount = Number(dto.chargeAmount ?? 0);
        if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
          throw new BadRequestException(
            'El monto por trabajo realizado debe ser mayor que cero',
          );
        }
        const commercialVersion = await this.createCancellationAdjustment(
          manager,
          order,
          item,
          chargeAmount,
          resolverId,
          dto.reason,
        );
        request.status =
          ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE;
        request.chargeAmount = chargeAmount;
        request.commercialVersionId = commercialVersion.id;
        request.resolvedAt = null;
        item.commercialStatus =
          ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE;
      } else {
        await this.assertNoConfirmedSale(manager, order.id);
        request.status = ServiceOrderCancellationStatus.APPROVED;
        this.applyCancellation(item, dto.reason, now);
      }

      await requestRepository.save(request);
      await manager.getRepository(ServiceOrderItem).save(item);
      await this.recordEvent(
        manager,
        order.id,
        item,
        'item.cancellation.resolved',
        previousStatus,
        item.operativeStatus,
        resolverId,
        dto.reason,
        request.id,
        request.status,
      );
      const projectedOrder = await this.projectionService.recalculateLocked(
        manager,
        order.id,
      );
      return { request, order: projectedOrder };
    });
  }

  private async loadLockedContext(
    manager: EntityManager,
    serviceOrderId: number,
    itemId: number,
    viewer?: CancellationViewer,
  ): Promise<{ order: ServiceOrder; item: ServiceOrderItem }> {
    const order = await manager.getRepository(ServiceOrder).findOne({
      where: { id: serviceOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order)
      throw new NotFoundException(
        `ServiceOrder with id ${serviceOrderId} not found`,
      );
    this.ensureViewerCanManageOrder(order, viewer);

    const item = await manager.getRepository(ServiceOrderItem).findOne({
      where: { id: itemId, serviceOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item)
      throw new NotFoundException(
        `ServiceOrderItem with id ${itemId} not found in order ${serviceOrderId}`,
      );
    return { order, item };
  }

  private assertItemCanReceiveRequest(item: ServiceOrderItem): void {
    if (
      [
        ServiceOrderOperativeStatus.CANCELADA,
        ServiceOrderOperativeStatus.ENTREGADA,
        ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
      ].includes(item.operativeStatus)
    ) {
      throw new BadRequestException(
        'El estado actual del equipo no permite solicitar su cancelación',
      );
    }
  }

  private hasDiagnosisStarted(item: ServiceOrderItem): boolean {
    return ![
      ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION,
      ServiceOrderTechnicalStatus.ASIGNADA,
    ].includes(item.technicalStatus);
  }

  private async createImmediateCancellationCharge(
    manager: EntityManager,
    item: ServiceOrderItem,
    actorId: number,
    reason: string,
    now: Date,
  ): Promise<ServiceOrderItemCommercialVersion> {
    const versionRepository = manager.getRepository(
      ServiceOrderItemCommercialVersion,
    );
    const baseVersion = await versionRepository.findOne({
      where: { serviceOrderItemId: item.id },
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      baseVersion &&
      baseVersion.status !== ServiceOrderItemCommercialVersionStatus.REPLACED
    ) {
      baseVersion.status = ServiceOrderItemCommercialVersionStatus.REPLACED;
      await versionRepository.save(baseVersion);
    }
    const version = await versionRepository.save(
      versionRepository.create({
        serviceOrderItemId: item.id,
        derivedFromVersionId: baseVersion?.id ?? null,
        versionNumber: Number(baseVersion?.versionNumber ?? 0) + 1,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        totalAmount: DIAGNOSIS_CANCELLATION_FEE,
        notes: `Cargo por cancelación después de iniciar diagnóstico: ${reason}`,
        createdByUserId: actorId,
        acceptedAt: now,
        acceptedByUserId: actorId,
      }),
    );
    const lineRepository = manager.getRepository(
      ServiceOrderItemCommercialLine,
    );
    version.lines = [
      await lineRepository.save(
        lineRepository.create({
          commercialVersionId: version.id,
          type: ServiceOrderCommercialLineType.SERVICE,
          productId: null,
          serviceId: null,
          catalogCodeSnapshot: 'SERVICIO_TECNICO_DIAGNOSTICO',
          catalogNameSnapshot: 'Servicio técnico de diagnóstico',
          catalogDescriptionSnapshot: `Cargo por cancelación del equipo ${item.code} después de iniciar el diagnóstico`,
          quantity: 1,
          unitPrice: DIAGNOSIS_CANCELLATION_FEE,
          grossAmount: DIAGNOSIS_CANCELLATION_FEE,
          discountAmount: 0,
          netAmount: DIAGNOSIS_CANCELLATION_FEE,
          requiresPurchase: false,
          notes: reason,
        }),
      ),
    ];
    return version;
  }

  private async createConfirmedCancellationAgreement(
    manager: EntityManager,
    order: ServiceOrder,
    chargedItems: ServiceOrderItem[],
    versions: Map<number, ServiceOrderItemCommercialVersion>,
    actorId: number,
    reason: string,
    now: Date,
  ): Promise<ServiceOrderAgreement> {
    const agreementRepository = manager.getRepository(ServiceOrderAgreement);
    const versionRepository = manager.getRepository(
      ServiceOrderItemCommercialVersion,
    );
    const currentAgreement = await agreementRepository.findOne({
      where: { serviceOrderId: order.id },
      order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      currentAgreement &&
      ![
        ServiceOrderAgreementStatus.SUPERSEDED,
        ServiceOrderAgreementStatus.VOIDED,
      ].includes(currentAgreement.status)
    ) {
      currentAgreement.status = ServiceOrderAgreementStatus.SUPERSEDED;
      await agreementRepository.save(currentAgreement);
    }
    const agreementSelections = chargedItems.map((item) => ({
      item,
      version: versions.get(Number(item.id))!,
    }));
    const remainingItems = await manager.getRepository(ServiceOrderItem).find({
      where: { serviceOrderId: order.id },
      order: { position: 'ASC' },
    });
    for (const item of remainingItems.filter(
      (candidate) =>
        candidate.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA,
    )) {
      const acceptedVersion = await versionRepository.findOne({
        where: {
          serviceOrderItemId: item.id,
          status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        },
        order: { versionNumber: 'DESC', createdAt: 'DESC' },
      });
      if (acceptedVersion) {
        agreementSelections.push({ item, version: acceptedVersion });
      }
    }
    const totalAmount = Number(
      agreementSelections
        .reduce(
          (total, selection) => total + Number(selection.version.totalAmount),
          0,
        )
        .toFixed(2),
    );
    const agreement = await agreementRepository.save(
      agreementRepository.create({
        serviceOrderId: order.id,
        diagnosisId: null,
        derivedFromAgreementId: currentAgreement?.id ?? null,
        sequenceNumber: Number(currentAgreement?.sequenceNumber ?? 0) + 1,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        source: ServiceOrderAgreementSource.TECHNICIAN_COORDINATION,
        totalAmount,
        notes: `Cargo consolidado por cancelación: ${reason}`,
        agreedAt: now,
        agreedByUserId: actorId,
      }),
    );
    const linkRepository = manager.getRepository(ServiceOrderAgreementItem);
    await linkRepository.save(
      agreementSelections.map(({ item, version }) =>
        linkRepository.create({
          serviceOrderAgreementId: agreement.id,
          serviceOrderItemId: item.id,
          commercialVersionId: version.id,
        }),
      ),
    );

    order.montoComprometidoVigente = totalAmount;
    order.montoReconciliado = 0;
    order.economicStatus = ServiceOrderEconomicStatus.PENDIENTE;
    await manager.getRepository(ServiceOrder).save(order);
    return agreement;
  }

  private applyCancellation(
    item: ServiceOrderItem,
    reason: string,
    now: Date,
  ): void {
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
    item.cancelledAt = item.cancelledAt ?? now;
    item.cancellationReason = reason.trim();
  }

  private async assertNoConfirmedSale(
    manager: EntityManager,
    serviceOrderId: number,
  ): Promise<void> {
    const links = await manager.getRepository(ServiceOrderSaleLink).find({
      where: { serviceOrderId },
      relations: ['sale'],
    });
    if (links.some((link) => link.sale?.status === SaleStatus.CONFIRMED)) {
      throw new BadRequestException(
        'La cancelación no puede finalizar mientras exista una venta confirmada. Primero debe anularse o revertirse la venta completa.',
      );
    }
  }

  private async createCancellationAdjustment(
    manager: EntityManager,
    order: ServiceOrder,
    item: ServiceOrderItem,
    chargeAmount: number,
    actorId: number,
    reason: string,
  ): Promise<ServiceOrderItemCommercialVersion> {
    const versionRepository = manager.getRepository(
      ServiceOrderItemCommercialVersion,
    );
    const baseVersion = await versionRepository.findOne({
      where: {
        serviceOrderItemId: item.id,
        status: In([
          ServiceOrderItemCommercialVersionStatus.DRAFT,
          ServiceOrderItemCommercialVersionStatus.ISSUED,
          ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        ]),
      },
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
    });
    if (
      baseVersion &&
      [
        ServiceOrderItemCommercialVersionStatus.DRAFT,
        ServiceOrderItemCommercialVersionStatus.ISSUED,
      ].includes(baseVersion.status)
    ) {
      baseVersion.status = ServiceOrderItemCommercialVersionStatus.REPLACED;
      await versionRepository.save(baseVersion);
    }
    const version = await versionRepository.save(
      versionRepository.create({
        serviceOrderItemId: item.id,
        derivedFromVersionId: baseVersion?.id ?? null,
        versionNumber: Number(baseVersion?.versionNumber ?? 0) + 1,
        status: ServiceOrderItemCommercialVersionStatus.DRAFT,
        totalAmount: chargeAmount,
        notes: `Ajuste por cancelación: ${reason.trim()}`,
        createdByUserId: actorId,
        acceptedAt: null,
        acceptedByUserId: null,
      }),
    );
    const lineRepository = manager.getRepository(
      ServiceOrderItemCommercialLine,
    );
    version.lines = [
      await lineRepository.save(
        lineRepository.create({
          commercialVersionId: version.id,
          type: ServiceOrderCommercialLineType.ADJUSTMENT,
          productId: null,
          serviceId: null,
          catalogCodeSnapshot: 'CANCELACION_TRABAJO_REALIZADO',
          catalogNameSnapshot: 'Cargo por trabajo realizado',
          catalogDescriptionSnapshot: reason.trim(),
          quantity: 1,
          unitPrice: chargeAmount,
          grossAmount: chargeAmount,
          discountAmount: 0,
          netAmount: chargeAmount,
          requiresPurchase: false,
          notes: reason.trim(),
        }),
      ),
    ];

    const activeItems = await manager.getRepository(ServiceOrderItem).find({
      where: { serviceOrderId: order.id },
      order: { position: 'ASC' },
    });
    const selectedVersions: Array<{
      item: ServiceOrderItem;
      version: ServiceOrderItemCommercialVersion;
    }> = [];
    for (const activeItem of activeItems.filter(
      (candidate) =>
        ![
          ServiceOrderOperativeStatus.CANCELADA,
          ServiceOrderOperativeStatus.ENTREGADA,
          ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
        ].includes(candidate.operativeStatus),
    )) {
      if (Number(activeItem.id) === Number(item.id)) {
        selectedVersions.push({ item: activeItem, version });
        continue;
      }
      const currentVersion = await versionRepository.findOne({
        where: {
          serviceOrderItemId: activeItem.id,
          status: In([
            ServiceOrderItemCommercialVersionStatus.DRAFT,
            ServiceOrderItemCommercialVersionStatus.ISSUED,
            ServiceOrderItemCommercialVersionStatus.ACCEPTED,
          ]),
        },
        order: { versionNumber: 'DESC', createdAt: 'DESC' },
      });
      if (!currentVersion) {
        throw new BadRequestException(
          `No se puede consolidar el ajuste porque el equipo ${activeItem.code} no tiene versión comercial`,
        );
      }
      selectedVersions.push({ item: activeItem, version: currentVersion });
    }

    const agreementRepository = manager.getRepository(ServiceOrderAgreement);
    const currentAgreement = await agreementRepository.findOne({
      where: { serviceOrderId: order.id },
      order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
    });
    await agreementRepository
      .createQueryBuilder()
      .update()
      .set({ status: ServiceOrderAgreementStatus.SUPERSEDED })
      .where('service_order_id = :serviceOrderId', { serviceOrderId: order.id })
      .andWhere('status = :status', {
        status: ServiceOrderAgreementStatus.DRAFT,
      })
      .execute();
    const agreement = await agreementRepository.save(
      agreementRepository.create({
        serviceOrderId: order.id,
        diagnosisId: null,
        derivedFromAgreementId: currentAgreement?.id ?? null,
        sequenceNumber: Number(currentAgreement?.sequenceNumber ?? 0) + 1,
        status: ServiceOrderAgreementStatus.DRAFT,
        source: ServiceOrderAgreementSource.TECHNICIAN_COORDINATION,
        totalAmount: Number(
          selectedVersions
            .reduce(
              (total, selected) => total + Number(selected.version.totalAmount),
              0,
            )
            .toFixed(2),
        ),
        notes: `Ajuste por cancelación del equipo ${item.code}`,
        agreedAt: null,
        agreedByUserId: null,
      }),
    );
    const linkRepository = manager.getRepository(ServiceOrderAgreementItem);
    await linkRepository.save(
      selectedVersions.map((selected) =>
        linkRepository.create({
          serviceOrderAgreementId: agreement.id,
          serviceOrderItemId: selected.item.id,
          commercialVersionId: selected.version.id,
        }),
      ),
    );
    return version;
  }

  private async recordEvent(
    manager: EntityManager,
    serviceOrderId: number,
    item: ServiceOrderItem,
    eventType: string,
    fromStatus: ServiceOrderOperativeStatus,
    toStatus: ServiceOrderOperativeStatus,
    actorId: number,
    reason: string,
    requestId: number,
    requestStatus: ServiceOrderCancellationStatus,
  ): Promise<void> {
    const repository = manager.getRepository(ServiceOrderEvent);
    await repository.save(
      repository.create({
        serviceOrderId,
        eventType,
        axis: 'operativo',
        capability: 'item-cancellation',
        fromStatus,
        toStatus,
        actorId,
        reason: reason.trim(),
        payloadJson: {
          serviceOrderItemId: item.id,
          itemCode: item.code,
          cancellationRequestId: requestId,
          cancellationStatus: requestStatus,
        },
      }),
    );
  }

  private requireActor(actorId?: number): number {
    const normalized = Number(actorId ?? 0);
    if (!normalized)
      throw new BadRequestException('Usuario autenticado no encontrado');
    return normalized;
  }

  private ensureViewerCanManageOrder(
    order: ServiceOrder,
    viewer?: CancellationViewer,
  ): void {
    if (!isTechnicianScopedRoleSet(viewer?.roles)) return;
    if (
      !viewer?.sub ||
      Number(order.assignedToTechnicianId) !== Number(viewer.sub)
    ) {
      throw new ForbiddenException(
        'No tienes acceso a los equipos de esta orden de servicio',
      );
    }
  }
}
