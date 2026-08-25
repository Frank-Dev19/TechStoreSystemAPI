import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderTransitionPolicy } from '../state-machines/service-order-transition-policy';
import { ServiceOrderAggregateProjectionService } from './service-order-aggregate-projection.service';
import { ServiceOrderFinalReportNotificationService } from './service-order-final-report-notification.service';

type ServiceOrderViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderItemWorkflowService {
  constructor(
    private readonly manager: EntityManager,
    private readonly transitionPolicy: ServiceOrderTransitionPolicy,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
    private readonly finalReportNotificationService: ServiceOrderFinalReportNotificationService,
  ) {}

  async changeTechnicalStatus(
    serviceOrderId: number,
    itemId: number,
    nextStatus: ServiceOrderTechnicalStatus,
    actorId?: number,
    reason?: string,
    viewer?: ServiceOrderViewer,
    transactionManager?: EntityManager,
  ): Promise<ServiceOrder> {
    const execute = async (manager: EntityManager) => {
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

      this.assertItemOperativelyActionable(item);
      this.transitionPolicy.assertTransition('tecnico', item.technicalStatus, nextStatus);
      if (nextStatus === ServiceOrderTechnicalStatus.EN_EJECUCION) {
        await this.assertGlobalCommercialGate(manager, serviceOrderId);
      }

      const previousStatus = item.technicalStatus;
      const now = new Date();
      item.technicalStatus = nextStatus;
      this.applyItemLifecycle(item, nextStatus, reason, now);
      await itemRepository.save(item);
      await this.recordEvent(manager, order.id, item, previousStatus, nextStatus, actorId, reason);
      return this.projectionService.recalculateLocked(manager, serviceOrderId);
    };

    if (transactionManager) {
      return execute(transactionManager);
    }

    const result = await this.manager.transaction(execute);
    if (nextStatus === ServiceOrderTechnicalStatus.RESUELTA) {
      await this.finalReportNotificationService.notifyResolvedItem(serviceOrderId, itemId);
    }
    return result;
  }

  private async assertGlobalCommercialGate(manager: EntityManager, serviceOrderId: number): Promise<void> {
    const activeItems = await manager.getRepository(ServiceOrderItem).find({ where: { serviceOrderId } });
    const blockedItem = activeItems.find(
      (item) =>
        item.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA &&
        ![ServiceOrderCommercialStatus.NO_REQUIERE, ServiceOrderCommercialStatus.AUTORIZADA].includes(
          item.commercialStatus,
        ),
    );
    if (blockedItem) {
      throw new BadRequestException(
        `No se puede iniciar la ejecución mientras el equipo ${blockedItem.code} tenga una definición comercial pendiente`,
      );
    }
  }

  private assertItemOperativelyActionable(item: ServiceOrderItem): void {
    if (
      ![
        ServiceOrderOperativeStatus.ABIERTA,
        ServiceOrderOperativeStatus.EN_PROCESO,
      ].includes(item.operativeStatus)
    ) {
      throw new BadRequestException(
        `El equipo ${item.code} no admite transiciones técnicas en su estado operativo actual`,
      );
    }
  }

  private applyItemLifecycle(
    item: ServiceOrderItem,
    nextStatus: ServiceOrderTechnicalStatus,
    reason: string | undefined,
    now: Date,
  ): void {
    switch (nextStatus) {
      case ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION:
      case ServiceOrderTechnicalStatus.ASIGNADA:
        item.operativeStatus = ServiceOrderOperativeStatus.ABIERTA;
        break;
      case ServiceOrderTechnicalStatus.RESUELTA:
        item.operativeStatus = ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA;
        item.serviceCompletedAt = item.serviceCompletedAt ?? now;
        item.readyForPickupAt = item.readyForPickupAt ?? now;
        item.resolvedAt = item.resolvedAt ?? now;
        break;
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        item.operativeStatus = ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION;
        item.resolvedAt = item.resolvedAt ?? now;
        item.cancellationReason = reason?.trim() || item.cancellationReason;
        break;
      default:
        item.operativeStatus = ServiceOrderOperativeStatus.EN_PROCESO;
        break;
    }
    if (nextStatus === ServiceOrderTechnicalStatus.EN_DIAGNOSTICO) {
      item.reviewStartedAt = item.reviewStartedAt ?? now;
    }
    if (nextStatus === ServiceOrderTechnicalStatus.EN_EJECUCION) {
      item.serviceStartedAt = item.serviceStartedAt ?? now;
    }
  }

  private async recordEvent(
    manager: EntityManager,
    serviceOrderId: number,
    item: ServiceOrderItem,
    fromStatus: ServiceOrderTechnicalStatus,
    toStatus: ServiceOrderTechnicalStatus,
    actorId?: number,
    reason?: string,
  ): Promise<void> {
    const repository = manager.getRepository(ServiceOrderEvent);
    await repository.save(
      repository.create({
        serviceOrderId,
        eventType: 'item.technical.changed',
        axis: 'tecnico',
        capability: 'item-workflow',
        fromStatus,
        toStatus,
        actorId: actorId ?? null,
        reason: reason?.trim() || null,
        payloadJson: { serviceOrderItemId: item.id, itemCode: item.code },
      }),
    );
  }

  private ensureViewerCanManageOrder(order: ServiceOrder, viewer?: ServiceOrderViewer): void {
    if (!isTechnicianScopedRoleSet(viewer?.roles)) return;
    if (!viewer?.sub || Number(order.assignedToTechnicianId) !== Number(viewer.sub)) {
      throw new ForbiddenException('No tienes acceso a los equipos de esta orden de servicio');
    }
  }
}
