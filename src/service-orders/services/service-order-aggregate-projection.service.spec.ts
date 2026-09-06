import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderAggregateProjectionService } from './service-order-aggregate-projection.service';

describe('ServiceOrderAggregateProjectionService', () => {
  const service = new ServiceOrderAggregateProjectionService();

  it('rehidrata el técnico asignado en la respuesta sin modificar su asignación', async () => {
    const order = createProjectionOrder(9);
    order.assignedToTechnicianId = 7;
    const hydratedOrder = {
      ...order,
      assignedTechnician: { id: 7, name: 'Carlos Rojas' },
    } as ServiceOrder;
    const items = [
      createItem(91, ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA),
    ];
    const orderRepository = {
      findOne: jest.fn().mockResolvedValueOnce(order).mockResolvedValueOnce(hydratedOrder),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ServiceOrder ? orderRepository : { find: jest.fn().mockResolvedValue(items) },
      ),
    } as any;

    const result = await service.recalculateLocked(manager, order.id);

    expect(result.assignedToTechnicianId).toBe(7);
    expect(result.assignedTechnician).toEqual(expect.objectContaining({ id: 7, name: 'Carlos Rojas' }));
    expect(result.assignedToTechnicianName).toBe('Carlos Rojas');
    expect(orderRepository.findOne).toHaveBeenLastCalledWith({
      where: { id: order.id },
      relations: ['assignedTechnician'],
    });
  });

  it('proyecta estado parcial cuando un equipo está resuelto y otro sigue en ejecución', async () => {
    const order = {
      id: 10,
      reviewStartedAt: null,
      serviceStartedAt: null,
      serviceCompletedAt: null,
      readyForPickupAt: null,
      deliveredAt: null,
      resolvedAt: null,
    } as ServiceOrder;
    const items = [
      createItem(101, ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA),
      createItem(102, ServiceOrderTechnicalStatus.EN_EJECUCION, ServiceOrderOperativeStatus.EN_PROCESO),
    ];
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const itemRepository = { find: jest.fn().mockResolvedValue(items) };
    const manager = {
      getRepository: jest.fn((entity) => (entity === ServiceOrder ? orderRepository : itemRepository)),
    } as any;

    const result = await service.recalculateLocked(manager, order.id);

    expect(result.technicalStatus).toBe(ServiceOrderTechnicalStatus.EN_EJECUCION);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.EN_PROCESO);
    expect(result.itemProgress).toEqual({
      total: 2,
      active: 2,
      resolved: 1,
      readyForPickup: 1,
      delivered: 0,
      cancelled: 0,
      cancellationPending: 0,
      isPartial: true,
    });
    expect(orderRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(orderRepository.save).toHaveBeenCalledWith(order);
  });

  it('proyecta cancelación solicitada mientras un equipo espera resolución', async () => {
    const order = {
      id: 12,
      reviewStartedAt: null,
      serviceStartedAt: null,
      serviceCompletedAt: null,
      readyForPickupAt: null,
      deliveredAt: null,
      resolvedAt: null,
    } as ServiceOrder;
    const items = [
      createItem(121, ServiceOrderTechnicalStatus.EN_EJECUCION, ServiceOrderOperativeStatus.CANCELACION_SOLICITADA),
      createItem(122, ServiceOrderTechnicalStatus.EN_EJECUCION, ServiceOrderOperativeStatus.EN_PROCESO),
    ];
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ServiceOrder ? orderRepository : { find: jest.fn().mockResolvedValue(items) },
      ),
    } as any;

    const result = await service.recalculateLocked(manager, order.id);

    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELACION_SOLICITADA);
    expect(result.itemProgress?.cancellationPending).toBe(1);
    expect(result.itemProgress?.cancelled).toBe(0);
  });

  it('marca lista la cabecera solo cuando todos los equipos activos terminaron', async () => {
    const order = {
      id: 11,
      reviewStartedAt: null,
      serviceStartedAt: null,
      serviceCompletedAt: null,
      readyForPickupAt: null,
      deliveredAt: null,
      resolvedAt: null,
    } as ServiceOrder;
    const items = [
      createItem(111, ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA),
      createItem(112, ServiceOrderTechnicalStatus.SIN_SOLUCION, ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION),
    ];
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ServiceOrder ? orderRepository : { find: jest.fn().mockResolvedValue(items) },
      ),
    } as any;

    const result = await service.recalculateLocked(manager, order.id);

    expect(result.technicalStatus).toBe(ServiceOrderTechnicalStatus.RESUELTA);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA);
    expect(result.itemProgress?.isPartial).toBe(false);
  });

  it('proyecta una garantía rechazada como terminal y lista para entrega', async () => {
    const order = createProjectionOrder(14);
    const item = createItem(
      141,
      ServiceOrderTechnicalStatus.GARANTIA_RECHAZADA,
      ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
    );
    item.serviceCompletedAt = new Date('2026-09-03T15:00:00.000Z');
    item.readyForPickupAt = item.serviceCompletedAt;
    item.resolvedAt = item.serviceCompletedAt;
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ServiceOrder ? orderRepository : { find: jest.fn().mockResolvedValue([item]) },
      ),
    } as any;

    const result = await service.recalculateLocked(manager, order.id);

    expect(result.technicalStatus).toBe(ServiceOrderTechnicalStatus.GARANTIA_RECHAZADA);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA);
    expect(result.itemProgress).toEqual(expect.objectContaining({ resolved: 1, readyForPickup: 1 }));
  });

  it('proyecta entrega parcial y finaliza solo cuando todos los equipos activos fueron entregados', async () => {
    const order = createProjectionOrder(13);
    const deliveredAt = new Date('2026-08-03T14:00:00.000Z');
    const first = createItem(131, ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderOperativeStatus.ENTREGADA);
    first.deliveredAt = deliveredAt;
    const second = createItem(
      132,
      ServiceOrderTechnicalStatus.RESUELTA,
      ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
    );
    const itemRepository = { find: jest.fn().mockResolvedValue([first, second]) };
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) => (entity === ServiceOrder ? orderRepository : itemRepository)),
    } as any;

    const partial = await service.recalculateLocked(manager, order.id);

    expect(partial.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGA_PARCIAL);
    expect(partial.deliveredAt).toBeNull();
    expect(partial.itemProgress).toEqual(expect.objectContaining({ delivered: 1, active: 2, isPartial: true }));

    second.operativeStatus = ServiceOrderOperativeStatus.ENTREGADA;
    second.deliveredAt = new Date('2026-08-03T15:00:00.000Z');
    const completed = await service.recalculateLocked(manager, order.id);

    expect(completed.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
    expect(completed.deliveredAt).toEqual(second.deliveredAt);
    expect(completed.itemProgress).toEqual(expect.objectContaining({ delivered: 2, active: 2, isPartial: false }));
  });

  it('mantiene pendiente la devolución física de equipos cancelados al calcular la fecha final de entrega', async () => {
    const order = createProjectionOrder(14);
    const delivered = createItem(141, ServiceOrderTechnicalStatus.RESUELTA, ServiceOrderOperativeStatus.ENTREGADA);
    delivered.deliveredAt = new Date('2026-08-03T16:00:00.000Z');
    const cancelled = createItem(142, ServiceOrderTechnicalStatus.EN_EJECUCION, ServiceOrderOperativeStatus.CANCELADA);
    cancelled.cancelledAt = new Date('2026-08-03T15:00:00.000Z');
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ServiceOrder ? orderRepository : { find: jest.fn().mockResolvedValue([delivered, cancelled]) },
      ),
    } as any;

    const result = await service.recalculateLocked(manager, order.id);

    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
    expect(result.deliveredAt).toBeNull();
    expect(result.itemProgress).toEqual(expect.objectContaining({ total: 2, delivered: 1, cancelled: 1 }));

    cancelled.deliveredAt = new Date('2026-08-03T17:00:00.000Z');
    const returned = await service.recalculateLocked(manager, order.id);

    expect(returned.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
    expect(returned.deliveredAt).toEqual(cancelled.deliveredAt);
    expect(returned.itemProgress).toEqual(expect.objectContaining({ total: 2, delivered: 2, cancelled: 1 }));
  });
});

function createProjectionOrder(id: number): ServiceOrder {
  return {
    id,
    reviewStartedAt: null,
    serviceStartedAt: null,
    serviceCompletedAt: null,
    readyForPickupAt: null,
    deliveredAt: null,
    resolvedAt: null,
  } as ServiceOrder;
}

function createItem(
  id: number,
  technicalStatus: ServiceOrderTechnicalStatus,
  operativeStatus: ServiceOrderOperativeStatus,
): ServiceOrderItem {
  const now = technicalStatus === ServiceOrderTechnicalStatus.RESUELTA ? new Date('2026-08-03T12:00:00Z') : null;
  return {
    id,
    serviceOrderId: 10,
    position: id,
    code: `SO-ITEM-${id}`,
    technicalStatus,
    operativeStatus,
    commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
    reviewStartedAt: null,
    serviceStartedAt: technicalStatus === ServiceOrderTechnicalStatus.EN_EJECUCION ? new Date() : null,
    serviceCompletedAt: now,
    readyForPickupAt: now,
    resolvedAt: now,
    deliveredAt: null,
  } as ServiceOrderItem;
}
