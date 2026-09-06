import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
import { ServiceOrderItemWorkflowService } from './service-order-item-workflow.service';
import { ServiceOrderFinalReportNotificationService } from './service-order-final-report-notification.service';

describe('ServiceOrderItemWorkflowService', () => {
  let service: ServiceOrderItemWorkflowService;
  let orderRepository: any;
  let itemRepository: any;
  let eventRepository: any;
  let manager: any;
  let transitionPolicy: jest.Mocked<ServiceOrderTransitionPolicy>;
  let projectionService: jest.Mocked<ServiceOrderAggregateProjectionService>;
  let finalReportNotificationService: jest.Mocked<ServiceOrderFinalReportNotificationService>;
  let order: ServiceOrder;
  let firstItem: ServiceOrderItem;
  let secondItem: ServiceOrderItem;

  beforeEach(() => {
    order = { id: 20, assignedToTechnicianId: 7 } as ServiceOrder;
    firstItem = createItem(201, ServiceOrderTechnicalStatus.EN_EJECUCION, ServiceOrderCommercialStatus.AUTORIZADA);
    secondItem = createItem(202, ServiceOrderTechnicalStatus.EN_EJECUCION, ServiceOrderCommercialStatus.AUTORIZADA);
    orderRepository = { findOne: jest.fn().mockResolvedValue(order) };
    itemRepository = {
      findOne: jest.fn().mockResolvedValue(firstItem),
      find: jest.fn().mockResolvedValue([firstItem, secondItem]),
      save: jest.fn(async (value) => value),
    };
    eventRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    manager = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrder) return orderRepository;
        if (entity === ServiceOrderItem) return itemRepository;
        if (entity === ServiceOrderEvent) return eventRepository;
        throw new Error(`Unexpected repository ${entity?.name}`);
      }),
    };
    transitionPolicy = {
      assertTransition: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderTransitionPolicy>;
    projectionService = {
      recalculateLocked: jest.fn().mockResolvedValue({
        ...order,
        items: [firstItem, secondItem],
        itemProgress: { total: 2, active: 2, resolved: 1, readyForPickup: 1, delivered: 0, cancelled: 0, isPartial: true },
      }),
    } as unknown as jest.Mocked<ServiceOrderAggregateProjectionService>;
    finalReportNotificationService = {
      notifyResolvedItem: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ServiceOrderFinalReportNotificationService>;
    service = new ServiceOrderItemWorkflowService(
      manager,
      transitionPolicy,
      projectionService,
      finalReportNotificationService,
      { markClaimInReview: jest.fn() } as any,
    );
  });

  it('resuelve un equipo sin sobrescribir el estado de su hermano y recalcula la cabecera', async () => {
    const result = await service.changeTechnicalStatus(
      order.id,
      firstItem.id,
      ServiceOrderTechnicalStatus.RESUELTA,
      7,
      'Reparación completada',
      { sub: 7, roles: [{ name: 'technician' }] } as any,
    );

    expect(firstItem.technicalStatus).toBe(ServiceOrderTechnicalStatus.RESUELTA);
    expect(firstItem.operativeStatus).toBe(ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA);
    expect(secondItem.technicalStatus).toBe(ServiceOrderTechnicalStatus.EN_EJECUCION);
    expect(eventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'item.technical.changed',
        payloadJson: { serviceOrderItemId: firstItem.id, itemCode: firstItem.code },
      }),
    );
    expect(projectionService.recalculateLocked).toHaveBeenCalledWith(manager, order.id);
    expect(result.itemProgress?.isPartial).toBe(true);
    expect(finalReportNotificationService.notifyResolvedItem).toHaveBeenCalledWith(order.id, firstItem.id);
  });

  it('deja una garantía rechazada lista para entrega sin tratarla como servicio resuelto', async () => {
    firstItem.technicalStatus = ServiceOrderTechnicalStatus.DIAGNOSTICADA;

    await service.changeTechnicalStatus(
      order.id,
      firstItem.id,
      ServiceOrderTechnicalStatus.GARANTIA_RECHAZADA,
      7,
      'Daño atribuible al uso del cliente',
      { sub: 7, roles: [{ name: 'technician' }] } as any,
    );

    expect(firstItem.technicalStatus).toBe(ServiceOrderTechnicalStatus.GARANTIA_RECHAZADA);
    expect(firstItem.operativeStatus).toBe(ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA);
    expect(firstItem.readyForPickupAt).toBeInstanceOf(Date);
    expect(firstItem.resolvedAt).toBeInstanceOf(Date);
    expect(finalReportNotificationService.notifyResolvedItem).not.toHaveBeenCalled();
  });

  it('bloquea la ejecución si cualquier equipo activo sigue pendiente comercialmente', async () => {
    firstItem.technicalStatus = ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION;
    secondItem.commercialStatus = ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE;

    await expect(
      service.changeTechnicalStatus(order.id, firstItem.id, ServiceOrderTechnicalStatus.EN_EJECUCION, 7),
    ).rejects.toThrow(BadRequestException);

    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(projectionService.recalculateLocked).not.toHaveBeenCalled();
  });

  it('propaga el fallo de proyección para que la transacción revierta la mutación local', async () => {
    projectionService.recalculateLocked.mockRejectedValue(new Error('projection failed'));

    await expect(
      service.changeTechnicalStatus(order.id, firstItem.id, ServiceOrderTechnicalStatus.RESUELTA, 7),
    ).rejects.toThrow('projection failed');

    expect(itemRepository.save).toHaveBeenCalled();
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(finalReportNotificationService.notifyResolvedItem).not.toHaveBeenCalled();
  });

  it('impide que un técnico actúe sobre una orden asignada a otro técnico', async () => {
    await expect(
      service.changeTechnicalStatus(
        order.id,
        firstItem.id,
        ServiceOrderTechnicalStatus.RESUELTA,
        99,
        undefined,
        { sub: 99, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(itemRepository.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
    ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
    ServiceOrderOperativeStatus.ENTREGADA,
    ServiceOrderOperativeStatus.CANCELADA,
    ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
  ])('impide transiciones técnicas cuando el equipo está en estado operativo %s', async (operativeStatus) => {
    firstItem.technicalStatus = ServiceOrderTechnicalStatus.ASIGNADA;
    firstItem.operativeStatus = operativeStatus;

    await expect(
      service.changeTechnicalStatus(
        order.id,
        firstItem.id,
        ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
        7,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(transitionPolicy.assertTransition).not.toHaveBeenCalled();
    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
    expect(projectionService.recalculateLocked).not.toHaveBeenCalled();
  });

  it.each([
    ServiceOrderOperativeStatus.ABIERTA,
    ServiceOrderOperativeStatus.EN_PROCESO,
  ])('permite transiciones técnicas desde el estado operativo %s', async (operativeStatus) => {
    firstItem.technicalStatus = ServiceOrderTechnicalStatus.ASIGNADA;
    firstItem.operativeStatus = operativeStatus;

    await service.changeTechnicalStatus(
      order.id,
      firstItem.id,
      ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
      7,
    );

    expect(itemRepository.save).toHaveBeenCalledWith(firstItem);
    expect(eventRepository.save).toHaveBeenCalled();
    expect(projectionService.recalculateLocked).toHaveBeenCalledWith(manager, order.id);
  });
});

function createItem(
  id: number,
  technicalStatus: ServiceOrderTechnicalStatus,
  commercialStatus: ServiceOrderCommercialStatus,
): ServiceOrderItem {
  return {
    id,
    serviceOrderId: 20,
    position: id,
    code: `SO-03-08-2026-0001-${id}`,
    technicalStatus,
    commercialStatus,
    operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    reviewStartedAt: null,
    serviceStartedAt: new Date('2026-08-03T12:00:00Z'),
    serviceCompletedAt: null,
    readyForPickupAt: null,
    resolvedAt: null,
    deliveredAt: null,
    cancellationReason: null,
  } as ServiceOrderItem;
}
