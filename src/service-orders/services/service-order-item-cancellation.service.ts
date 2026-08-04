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

@Injectable()
export class ServiceOrderItemCancellationService {
  constructor(
    private readonly manager: EntityManager,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
  ) {}

  async requestCancellation(
    serviceOrderId: number,
    itemId: number,
    dto: RequestServiceOrderItemCancellationDto,
    actorId?: number,
    viewer?: CancellationViewer,
  ) {
    const requesterId = this.requireActor(actorId);
    return this.manager.transaction(async (manager) => {
      const { order, item } = await this.loadLockedContext(
        manager,
        serviceOrderId,
        itemId,
        viewer,
      );
      this.assertItemCanReceiveRequest(item);

      const requestRepository = manager.getRepository(
        ServiceOrderItemCancellationRequest,
      );
      const activeRequest = await requestRepository.findOne({
        where: {
          serviceOrderItemId: item.id,
          status: In([
            ServiceOrderCancellationStatus.PENDING,
            ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
          ]),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (activeRequest) {
        throw new BadRequestException(
          'El equipo ya tiene una solicitud de cancelación pendiente',
        );
      }

      const now = new Date();
      const isLateCancellation = this.hasExecutionStarted(item);
      if (!isLateCancellation)
        await this.assertNoConfirmedSale(manager, order.id);

      const request = await requestRepository.save(
        requestRepository.create({
          serviceOrderItemId: item.id,
          status: isLateCancellation
            ? ServiceOrderCancellationStatus.PENDING
            : ServiceOrderCancellationStatus.APPROVED,
          resolution: isLateCancellation
            ? null
            : ServiceOrderCancellationResolution.APPROVED_WITHOUT_CHARGE,
          channel: dto.channel,
          reason: dto.reason.trim(),
          requestedByUserId: requesterId,
          requestedAt: now,
          previousOperativeStatus: item.operativeStatus,
          previousTechnicalStatus: item.technicalStatus,
          resolvedByUserId: isLateCancellation ? null : requesterId,
          resolvedAt: isLateCancellation ? null : now,
          resolutionReason: isLateCancellation ? null : dto.reason.trim(),
          chargeAmount: null,
          commercialVersionId: null,
        }),
      );

      if (isLateCancellation) {
        item.operativeStatus =
          ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
      } else {
        this.applyCancellation(item, dto.reason, now);
      }
      await manager.getRepository(ServiceOrderItem).save(item);
      await this.recordEvent(
        manager,
        order.id,
        item,
        'item.cancellation.requested',
        request.previousOperativeStatus,
        item.operativeStatus,
        requesterId,
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

  private hasExecutionStarted(item: ServiceOrderItem): boolean {
    return (
      item.serviceStartedAt instanceof Date ||
      [
        ServiceOrderTechnicalStatus.EN_EJECUCION,
        ServiceOrderTechnicalStatus.BLOQUEADA,
        ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO,
        ServiceOrderTechnicalStatus.RESUELTA,
        ServiceOrderTechnicalStatus.SIN_SOLUCION,
      ].includes(item.technicalStatus)
    );
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
