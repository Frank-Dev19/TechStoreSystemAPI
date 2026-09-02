import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { ServiceOrderItemCancellationRequest } from '../entities/service-order-item-cancellation-request.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCancellationStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
} from '../enums';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderAggregateProjectionService } from './service-order-aggregate-projection.service';
import { WarrantiesService } from '../../warranties/warranties.service';
import { ServiceType } from '../enums';

type DeliveryViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderItemDeliveryService {
  constructor(
    private readonly manager: EntityManager,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly warrantiesService: WarrantiesService,
  ) {}

  async deliverOnlyItem(serviceOrderId: number, actorId?: number, viewer?: DeliveryViewer) {
    const items = await this.manager.getRepository(ServiceOrderItem).find({
      where: { serviceOrderId },
      order: { position: 'ASC' },
      take: 2,
    });
    if (items.length !== 1) {
      throw new BadRequestException(
        'Esta orden requiere seleccionar el equipo que se entregará',
      );
    }
    return this.deliverItem(serviceOrderId, items[0].id, actorId, viewer);
  }

  async deliverItem(serviceOrderId: number, itemId: number, actorId?: number, viewer?: DeliveryViewer) {
    return this.deliverItems(serviceOrderId, [itemId], actorId, viewer);
  }

  async deliverItems(
    serviceOrderId: number,
    itemIds: number[],
    actorId?: number,
    viewer?: DeliveryViewer,
  ) {
    const normalizedItemIds = [...new Set((itemIds ?? []).map(Number))];
    if (!normalizedItemIds.length || normalizedItemIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new BadRequestException('Debes seleccionar al menos un equipo válido para entregar');
    }
    if (normalizedItemIds.length !== itemIds.length) {
      throw new BadRequestException('La selección de equipos no debe contener duplicados');
    }

    let shouldNotifySurvey = false;
    const projectedOrder = await this.manager.transaction(async (manager) => {
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`ServiceOrder with id ${serviceOrderId} not found`);
      this.ensureViewerCanManageOrder(order, viewer);

      const itemRepository = manager.getRepository(ServiceOrderItem);
      const items: ServiceOrderItem[] = [];
      for (const itemId of normalizedItemIds.sort((left, right) => left - right)) {
        const item = await itemRepository.findOne({
          where: { id: itemId, serviceOrderId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!item) {
          throw new NotFoundException(`ServiceOrderItem with id ${itemId} not found in order ${serviceOrderId}`);
        }
        items.push(item);
      }

      const pendingItems = items.filter(
        (item) => !item.deliveredAt && item.operativeStatus !== ServiceOrderOperativeStatus.ENTREGADA,
      );
      let requiresEconomicCoverage = false;
      let includesChargedCancellation = false;

      for (const item of pendingItems) {
        const isCancelled = item.operativeStatus === ServiceOrderOperativeStatus.CANCELADA;
        if (item.operativeStatus !== ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA && !isCancelled) {
          throw new BadRequestException(`El equipo ${item.code} debe estar listo para entrega`);
        }

        const activeCancellation = await manager.getRepository(ServiceOrderItemCancellationRequest).findOne({
          where: {
            serviceOrderItemId: item.id,
            status: In([
              ServiceOrderCancellationStatus.PENDING,
              ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
            ]),
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (activeCancellation) {
          throw new BadRequestException(`El equipo ${item.code} tiene una cancelación pendiente`);
        }

        const approvedCancellation = isCancelled
          ? await manager.getRepository(ServiceOrderItemCancellationRequest).findOne({
              where: {
                serviceOrderItemId: item.id,
                status: ServiceOrderCancellationStatus.APPROVED,
              },
              order: { requestedAt: 'DESC' },
              lock: { mode: 'pessimistic_read' },
            })
          : null;
        const hasCancellationCharge = Number(approvedCancellation?.chargeAmount ?? 0) > 0;
        requiresEconomicCoverage ||= !isCancelled || hasCancellationCharge;
        includesChargedCancellation ||= isCancelled && hasCancellationCharge;
      }

      if (requiresEconomicCoverage && order.serviceType !== ServiceType.WARRANTY_SERVICE) {
        const currentAgreement = await manager.getRepository(ServiceOrderAgreement).findOne({
          where: { serviceOrderId },
          order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
          lock: { mode: 'pessimistic_read' },
        });
        if (currentAgreement?.status !== ServiceOrderAgreementStatus.CONFIRMED) {
          throw new BadRequestException('La orden no tiene una cotización vigente confirmada');
        }
        if (![ServiceOrderEconomicStatus.TOTAL, ServiceOrderEconomicStatus.EXONERADO].includes(order.economicStatus)) {
          throw new BadRequestException(
            includesChargedCancellation
              ? 'El cargo por diagnóstico debe estar pagado o exonerado antes de entregar el equipo'
              : 'La orden requiere cobertura económica total o una exoneración antes de entregar equipos',
          );
        }
      }

      if (
        requiresEconomicCoverage &&
        order.serviceType === ServiceType.WARRANTY_SERVICE &&
        order.economicStatus !== ServiceOrderEconomicStatus.EXONERADO
      ) {
        throw new BadRequestException('La atención por garantía debe permanecer exonerada');
      }

      const now = new Date();
      for (const item of pendingItems) {
        const previousStatus = item.operativeStatus;
        if (item.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA) {
          item.operativeStatus = ServiceOrderOperativeStatus.ENTREGADA;
        }
        item.deliveredAt = now;
        await itemRepository.save(item);
        await this.recordEvent(manager, order.id, item, previousStatus, actorId);
      }
      await this.warrantiesService.issueServiceCoveragesForDelivery(manager, order, pendingItems, {
        id: actorId,
      });
      const result = await this.projectionService.recalculateLocked(manager, serviceOrderId);
      shouldNotifySurvey =
        pendingItems.length > 0 &&
        (result.items ?? []).length > 0 &&
        (result.items ?? []).every((item) => Boolean(item.deliveredAt)) &&
        (result.items ?? []).some((item) => item.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA);
      return result;
    });

    if (shouldNotifySurvey) await this.messageMatrixService.notifySurveyRequest(projectedOrder);
    return projectedOrder;
  }

  private async recordEvent(
    manager: EntityManager,
    serviceOrderId: number,
    item: ServiceOrderItem,
    fromStatus: ServiceOrderOperativeStatus,
    actorId?: number,
  ): Promise<void> {
    const repository = manager.getRepository(ServiceOrderEvent);
    await repository.save(
      repository.create({
        serviceOrderId,
        eventType: 'item.delivered',
        axis: 'operative',
        capability: 'item-delivery',
        fromStatus,
        toStatus: item.operativeStatus,
        actorId: actorId ?? null,
        reason: null,
        payloadJson: {
          serviceOrderItemId: item.id,
          itemCode: item.code,
          deliveredAt: item.deliveredAt?.toISOString() ?? null,
        },
      }),
    );
  }

  private ensureViewerCanManageOrder(order: ServiceOrder, viewer?: DeliveryViewer): void {
    if (!isTechnicianScopedRoleSet(viewer?.roles)) return;
    if (!viewer?.sub || Number(order.assignedToTechnicianId) !== Number(viewer.sub)) {
      throw new ForbiddenException('No tienes acceso a los equipos de esta orden de servicio');
    }
  }
}
