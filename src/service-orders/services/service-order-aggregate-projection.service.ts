import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';

export type ServiceOrderItemProgress = {
  total: number;
  active: number;
  resolved: number;
  readyForPickup: number;
  delivered: number;
  cancelled: number;
  cancellationPending: number;
  isPartial: boolean;
};

export function buildServiceOrderItemProgress(items: ServiceOrderItem[]): ServiceOrderItemProgress {
  const activeItems = items.filter((item) => item.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA);
  const terminalStatuses = [ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderTechnicalStatus.SIN_SOLUCION];
  const resolved = activeItems.filter((item) => terminalStatuses.includes(item.technicalStatus)).length;
  const readyForPickup = activeItems.filter((item) =>
    [ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA, ServiceOrderOperativeStatus.ENTREGADA].includes(
      item.operativeStatus,
    ),
  ).length;
  const delivered = activeItems.filter((item) => item.operativeStatus === ServiceOrderOperativeStatus.ENTREGADA).length;
  const cancellationPending = activeItems.filter(
    (item) => item.operativeStatus === ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
  ).length;
  return {
    total: items.length,
    active: activeItems.length,
    resolved,
    readyForPickup,
    delivered,
    cancelled: items.length - activeItems.length,
    cancellationPending,
    isPartial:
      (resolved > 0 && resolved < activeItems.length) ||
      (delivered > 0 && delivered < activeItems.length),
  };
}

@Injectable()
export class ServiceOrderAggregateProjectionService {
  async recalculateLocked(manager: EntityManager, serviceOrderId: number): Promise<ServiceOrder> {
    const orderRepository = manager.getRepository(ServiceOrder);
    const itemRepository = manager.getRepository(ServiceOrderItem);
    const order = await orderRepository.findOne({
      where: { id: serviceOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) {
      throw new NotFoundException(`ServiceOrder with id ${serviceOrderId} not found`);
    }

    const items = await itemRepository.find({
      where: { serviceOrderId },
      order: { position: 'ASC' },
    });
    if (!items.length) {
      throw new NotFoundException(`ServiceOrder with id ${serviceOrderId} has no items`);
    }

    const activeItems = items.filter((item) => item.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA);
    order.technicalStatus = this.projectTechnicalStatus(activeItems);
    order.operativeStatus = this.projectOperativeStatus(activeItems);
    order.commercialStatus = this.projectCommercialStatus(activeItems);
    this.projectLifecycleTimestamps(order, activeItems);
    order.items = items;
    order.itemProgress = buildServiceOrderItemProgress(items);

    await orderRepository.save(order);
    return order;
  }

  private projectTechnicalStatus(items: ServiceOrderItem[]): ServiceOrderTechnicalStatus {
    if (!items.length) return ServiceOrderTechnicalStatus.SIN_SOLUCION;
    const statuses = new Set(items.map((item) => item.technicalStatus));
    if (statuses.size === 1) return items[0].technicalStatus;
    if (items.every((item) => this.isTerminalTechnical(item.technicalStatus))) {
      return items.every((item) => item.technicalStatus === ServiceOrderTechnicalStatus.SIN_SOLUCION)
        ? ServiceOrderTechnicalStatus.SIN_SOLUCION
        : ServiceOrderTechnicalStatus.RESUELTA;
    }

    const precedence = [
      ServiceOrderTechnicalStatus.EN_EJECUCION,
      ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO,
      ServiceOrderTechnicalStatus.BLOQUEADA,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
      ServiceOrderTechnicalStatus.DIAGNOSTICADA,
      ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
      ServiceOrderTechnicalStatus.ASIGNADA,
      ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION,
    ];
    return precedence.find((status) => statuses.has(status)) ?? ServiceOrderTechnicalStatus.ASIGNADA;
  }

  private projectOperativeStatus(activeItems: ServiceOrderItem[]): ServiceOrderOperativeStatus {
    if (!activeItems.length) return ServiceOrderOperativeStatus.CANCELADA;
    if (activeItems.some((item) => item.operativeStatus === ServiceOrderOperativeStatus.CANCELACION_SOLICITADA)) {
      return ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    }
    if (activeItems.every((item) => item.operativeStatus === ServiceOrderOperativeStatus.ENTREGADA)) {
      return ServiceOrderOperativeStatus.ENTREGADA;
    }
    if (activeItems.some((item) => item.operativeStatus === ServiceOrderOperativeStatus.ENTREGADA)) {
      return ServiceOrderOperativeStatus.ENTREGA_PARCIAL;
    }
    if (activeItems.every((item) => item.technicalStatus === ServiceOrderTechnicalStatus.SIN_SOLUCION)) {
      return ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION;
    }
    const allFinished = activeItems.every((item) => this.isTerminalTechnical(item.technicalStatus));
    if (allFinished) return ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA;
    const allNotStarted = activeItems.every((item) =>
      [
        ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION,
        ServiceOrderTechnicalStatus.ASIGNADA,
      ].includes(item.technicalStatus),
    );
    return allNotStarted ? ServiceOrderOperativeStatus.ABIERTA : ServiceOrderOperativeStatus.EN_PROCESO;
  }

  private projectCommercialStatus(items: ServiceOrderItem[]): ServiceOrderCommercialStatus {
    if (!items.length) return ServiceOrderCommercialStatus.NO_REQUIERE;
    const statuses = new Set(items.map((item) => item.commercialStatus));
    if (statuses.size === 1) return items[0].commercialStatus;
    if (
      items.every((item) =>
        [ServiceOrderCommercialStatus.NO_REQUIERE, ServiceOrderCommercialStatus.AUTORIZADA].includes(
          item.commercialStatus,
        ),
      )
    ) {
      return statuses.has(ServiceOrderCommercialStatus.AUTORIZADA)
        ? ServiceOrderCommercialStatus.AUTORIZADA
        : ServiceOrderCommercialStatus.NO_REQUIERE;
    }
    const precedence = [
      ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE,
      ServiceOrderCommercialStatus.PROPUESTA_EMITIDA,
      ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
      ServiceOrderCommercialStatus.RECHAZADA,
      ServiceOrderCommercialStatus.EXPIRADA,
      ServiceOrderCommercialStatus.REEMPLAZADA,
    ];
    return precedence.find((status) => statuses.has(status)) ?? ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA;
  }

  private projectLifecycleTimestamps(order: ServiceOrder, items: ServiceOrderItem[]): void {
    order.reviewStartedAt = this.earliest(items.map((item) => item.reviewStartedAt));
    order.serviceStartedAt = this.earliest(items.map((item) => item.serviceStartedAt));
    const allTerminal = items.length > 0 && items.every((item) => this.isTerminalTechnical(item.technicalStatus));
    order.serviceCompletedAt = allTerminal ? this.latest(items.map((item) => item.serviceCompletedAt)) : null;
    order.readyForPickupAt = allTerminal ? this.latest(items.map((item) => item.readyForPickupAt)) : null;
    order.resolvedAt = allTerminal ? this.latest(items.map((item) => item.resolvedAt)) : null;
    const allDelivered = items.length > 0 && items.every((item) => item.deliveredAt instanceof Date);
    order.deliveredAt = allDelivered ? this.latest(items.map((item) => item.deliveredAt)) : null;
  }

  private isTerminalTechnical(status: ServiceOrderTechnicalStatus): boolean {
    return [ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderTechnicalStatus.SIN_SOLUCION].includes(status);
  }

  private earliest(values: Array<Date | null>): Date | null {
    const timestamps = values.filter((value): value is Date => value instanceof Date).map((value) => value.getTime());
    return timestamps.length ? new Date(Math.min(...timestamps)) : null;
  }

  private latest(values: Array<Date | null>): Date | null {
    const timestamps = values.filter((value): value is Date => value instanceof Date).map((value) => value.getTime());
    return timestamps.length ? new Date(Math.max(...timestamps)) : null;
  }
}
