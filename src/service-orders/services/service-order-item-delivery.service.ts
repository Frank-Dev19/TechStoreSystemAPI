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

type DeliveryViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderItemDeliveryService {
  constructor(
    private readonly manager: EntityManager,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
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
    let completedNow = false;
    const projectedOrder = await this.manager.transaction(async (manager) => {
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`ServiceOrder with id ${serviceOrderId} not found`);
      this.ensureViewerCanManageOrder(order, viewer);

      const itemRepository = manager.getRepository(ServiceOrderItem);
      const item = await itemRepository.findOne({
        where: { id: itemId, serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException(`ServiceOrderItem with id ${itemId} not found in order ${serviceOrderId}`);
      }

      if (item.operativeStatus === ServiceOrderOperativeStatus.ENTREGADA) {
        return this.projectionService.recalculateLocked(manager, serviceOrderId);
      }
      if (item.operativeStatus !== ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA) {
        throw new BadRequestException('El equipo debe estar listo para entrega');
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
        throw new BadRequestException('El equipo tiene una cancelación pendiente');
      }

      const currentAgreement = await manager.getRepository(ServiceOrderAgreement).findOne({
        where: { serviceOrderId },
        order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
        lock: { mode: 'pessimistic_read' },
      });
      if (currentAgreement?.status !== ServiceOrderAgreementStatus.CONFIRMED) {
        throw new BadRequestException('La orden no tiene un acuerdo comercial vigente confirmado');
      }
      if (![ServiceOrderEconomicStatus.TOTAL, ServiceOrderEconomicStatus.EXONERADO].includes(order.economicStatus)) {
        throw new BadRequestException('La orden requiere cobertura económica total o una exoneración antes de entregar equipos');
      }

      const now = new Date();
      item.operativeStatus = ServiceOrderOperativeStatus.ENTREGADA;
      item.deliveredAt = item.deliveredAt ?? now;
      await itemRepository.save(item);
      await this.recordEvent(manager, order.id, item, actorId);
      const result = await this.projectionService.recalculateLocked(manager, serviceOrderId);
      completedNow = result.operativeStatus === ServiceOrderOperativeStatus.ENTREGADA;
      return result;
    });

    if (completedNow) await this.messageMatrixService.notifySurveyRequest(projectedOrder);
    return projectedOrder;
  }

  private async recordEvent(
    manager: EntityManager,
    serviceOrderId: number,
    item: ServiceOrderItem,
    actorId?: number,
  ): Promise<void> {
    const repository = manager.getRepository(ServiceOrderEvent);
    await repository.save(
      repository.create({
        serviceOrderId,
        eventType: 'item.delivered',
        axis: 'operative',
        capability: 'item-delivery',
        fromStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
        toStatus: ServiceOrderOperativeStatus.ENTREGADA,
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
