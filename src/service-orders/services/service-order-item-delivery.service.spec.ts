import { BadRequestException } from '@nestjs/common';
import { ServiceOrderItemCancellationRequest } from '../entities/service-order-item-cancellation-request.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCancellationStatus,
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderAggregateProjectionService } from './service-order-aggregate-projection.service';
import { ServiceOrderItemDeliveryService } from './service-order-item-delivery.service';

describe('ServiceOrderItemDeliveryService', () => {
  let service: ServiceOrderItemDeliveryService;
  let order: ServiceOrder;
  let item: ServiceOrderItem;
  let orderRepository: any;
  let itemRepository: any;
  let agreementRepository: any;
  let cancellationRepository: any;
  let eventRepository: any;
  let manager: any;
  let projection: jest.Mocked<ServiceOrderAggregateProjectionService>;
  let messageMatrix: jest.Mocked<ServiceOrderMessageMatrixService>;

  beforeEach(() => {
    order = {
      id: 20,
      economicStatus: ServiceOrderEconomicStatus.TOTAL,
      assignedToTechnicianId: 7,
    } as ServiceOrder;
    item = createReadyItem();
    orderRepository = { findOne: jest.fn().mockResolvedValue(order) };
    itemRepository = {
      findOne: jest.fn().mockResolvedValue(item),
      find: jest.fn().mockResolvedValue([item]),
      save: jest.fn(async (value) => value),
    };
    agreementRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 301,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        sequenceNumber: 2,
      }),
    };
    cancellationRepository = { findOne: jest.fn().mockResolvedValue(null) };
    eventRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    manager = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrder) return orderRepository;
        if (entity === ServiceOrderItem) return itemRepository;
        if (entity === ServiceOrderAgreement) return agreementRepository;
        if (entity === ServiceOrderItemCancellationRequest) return cancellationRepository;
        if (entity === ServiceOrderEvent) return eventRepository;
        throw new Error(`Unexpected repository ${entity?.name}`);
      }),
    };
    projection = {
      recalculateLocked: jest.fn().mockResolvedValue({
        ...order,
        operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
        items: [item],
        itemProgress: {
          total: 1,
          active: 1,
          resolved: 1,
          readyForPickup: 1,
          delivered: 1,
          cancelled: 0,
          cancellationPending: 0,
          isPartial: false,
        },
      }),
    } as unknown as jest.Mocked<ServiceOrderAggregateProjectionService>;
    messageMatrix = {
      notifySurveyRequest: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;
    service = new ServiceOrderItemDeliveryService(manager, projection, messageMatrix);
  });

  it('entrega varios equipos en una sola transacción con la misma fecha', async () => {
    const secondItem = { ...createReadyItem(), id: 202, code: 'SO-03-08-2026-0001-02' };
    itemRepository.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve(Number(where.id) === 202 ? secondItem : item),
    );
    projection.recalculateLocked.mockImplementation(async () => ({
      ...order,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
      items: [item, secondItem],
    } as ServiceOrder));

    await service.deliverItems(order.id, [202, 201], 22);

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(itemRepository.save).toHaveBeenCalledTimes(2);
    expect(item.deliveredAt).toBe(secondItem.deliveredAt);
    expect(eventRepository.save).toHaveBeenCalledTimes(2);
    expect(projection.recalculateLocked).toHaveBeenCalledTimes(1);
  });

  it('entrega en un lote un equipo listo y cancelaciones sin cargo y con cargo pagado', async () => {
    const cancelledWithoutCharge = {
      ...createReadyItem(),
      id: 202,
      code: 'SO-03-08-2026-0001-02',
      operativeStatus: ServiceOrderOperativeStatus.CANCELADA,
    };
    const cancelledWithCharge = {
      ...createReadyItem(),
      id: 203,
      code: 'SO-03-08-2026-0001-03',
      operativeStatus: ServiceOrderOperativeStatus.CANCELADA,
    };
    const itemsById = new Map([
      [201, item],
      [202, cancelledWithoutCharge],
      [203, cancelledWithCharge],
    ]);
    itemRepository.findOne.mockImplementation(({ where }: any) => Promise.resolve(itemsById.get(Number(where.id))));
    cancellationRepository.findOne.mockImplementation(({ where }: any) => {
      if (where.status !== ServiceOrderCancellationStatus.APPROVED) return Promise.resolve(null);
      return Promise.resolve({
        status: ServiceOrderCancellationStatus.APPROVED,
        chargeAmount: Number(where.serviceOrderItemId) === 203 ? 20 : null,
      });
    });
    projection.recalculateLocked.mockImplementation(async () => ({
      ...order,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
      items: [item, cancelledWithoutCharge, cancelledWithCharge],
    } as ServiceOrder));

    await service.deliverItems(order.id, [201, 202, 203], 22);

    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
    expect(cancelledWithoutCharge.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(cancelledWithCharge.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(itemRepository.save).toHaveBeenCalledTimes(3);
  });

  it('rechaza todo el lote antes de guardar si uno de los equipos no es entregable', async () => {
    const blockedItem = {
      ...createReadyItem(),
      id: 202,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    };
    itemRepository.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve(Number(where.id) === 202 ? blockedItem : item),
    );

    await expect(service.deliverItems(order.id, [201, 202], 22)).rejects.toThrow('listo para entrega');

    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza IDs duplicados o equipos que no pertenecen a la orden sin persistir cambios', async () => {
    await expect(service.deliverItems(order.id, [201, 201], 22)).rejects.toThrow('duplicados');

    itemRepository.findOne.mockResolvedValueOnce(item).mockResolvedValueOnce(null);
    await expect(service.deliverItems(order.id, [201, 999], 22)).rejects.toThrow('not found in order');

    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('tolera equipos ya entregados en un reintento sin duplicar sus eventos', async () => {
    const deliveredItem = {
      ...createReadyItem(),
      id: 202,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
      deliveredAt: new Date('2026-08-03T15:00:00.000Z'),
    };
    itemRepository.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve(Number(where.id) === 202 ? deliveredItem : item),
    );
    projection.recalculateLocked.mockImplementation(async () => ({
      ...order,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
      items: [item, deliveredItem],
    } as ServiceOrder));

    await service.deliverItems(order.id, [201, 202], 22);

    expect(itemRepository.save).toHaveBeenCalledTimes(1);
    expect(eventRepository.save).toHaveBeenCalledTimes(1);
  });

  it('no envía encuesta cuando todos los equipos entregados fueron cancelados', async () => {
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
    cancellationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: ServiceOrderCancellationStatus.APPROVED, chargeAmount: null });
    projection.recalculateLocked.mockImplementation(async () => ({
      ...order,
      operativeStatus: ServiceOrderOperativeStatus.CANCELADA,
      items: [item],
    } as ServiceOrder));

    await service.deliverItems(order.id, [item.id], 22);

    expect(messageMatrix.notifySurveyRequest).not.toHaveBeenCalled();
  });

  it('entrega solo el equipo seleccionado y registra el evento dentro de la transacción', async () => {
    const result = await service.deliverItem(order.id, item.id, 22, {
      sub: 22,
      roles: [{ name: 'recepcionist' }],
    } as any);

    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
    expect(item.deliveredAt).toBeInstanceOf(Date);
    expect(eventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'item.delivered',
        axis: 'operative',
        capability: 'item-delivery',
        actorId: 22,
        payloadJson: expect.objectContaining({
          serviceOrderItemId: item.id,
          itemCode: item.code,
        }),
      }),
    );
    expect(projection.recalculateLocked).toHaveBeenCalledWith(manager, order.id);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
    expect(messageMatrix.notifySurveyRequest).toHaveBeenCalledWith(result);
  });

  it('mantiene el endpoint legado solo para órdenes de un único equipo', async () => {
    const deliverSpy = jest.spyOn(service, 'deliverItem');

    await service.deliverOnlyItem(order.id, 22);

    expect(deliverSpy).toHaveBeenCalledWith(order.id, item.id, 22, undefined);

    itemRepository.find.mockResolvedValue([item, { ...item, id: 202 }]);
    await expect(service.deliverOnlyItem(order.id, 22)).rejects.toThrow('seleccionar el equipo');
  });

  it.each([
    ServiceOrderEconomicStatus.NO_APLICA,
    ServiceOrderEconomicStatus.PENDIENTE,
    ServiceOrderEconomicStatus.PARCIAL,
    ServiceOrderEconomicStatus.REVERTIDO,
  ])('bloquea la entrega con cobertura económica %s', async (economicStatus) => {
    order.economicStatus = economicStatus;

    await expect(service.deliverItem(order.id, item.id, 22)).rejects.toThrow(BadRequestException);

    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  it('permite entregar una orden exonerada', async () => {
    order.economicStatus = ServiceOrderEconomicStatus.EXONERADO;

    await service.deliverItem(order.id, item.id, 22);

    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.ENTREGADA);
  });

  it('entrega una cancelación sin cargo y conserva su estado cancelado', async () => {
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
    order.economicStatus = ServiceOrderEconomicStatus.NO_APLICA;
    agreementRepository.findOne.mockResolvedValue(null);
    cancellationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 402,
        status: ServiceOrderCancellationStatus.APPROVED,
        chargeAmount: null,
      });

    await service.deliverItem(order.id, item.id, 22);

    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(item.deliveredAt).toBeInstanceOf(Date);
    expect(eventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: ServiceOrderOperativeStatus.CANCELADA,
        toStatus: ServiceOrderOperativeStatus.CANCELADA,
      }),
    );
  });

  it('bloquea una cancelación con cargo hasta que la orden esté pagada o exonerada', async () => {
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
    order.economicStatus = ServiceOrderEconomicStatus.PENDIENTE;
    cancellationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 403,
        status: ServiceOrderCancellationStatus.APPROVED,
        chargeAmount: 20,
      });

    await expect(service.deliverItem(order.id, item.id, 22)).rejects.toThrow(
      'cargo por diagnóstico debe estar pagado o exonerado',
    );
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  it('entrega una cancelación con cargo cuando la cobertura económica es total', async () => {
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
    cancellationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 404,
        status: ServiceOrderCancellationStatus.APPROVED,
        chargeAmount: 20,
      });

    await service.deliverItem(order.id, item.id, 22);

    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(item.deliveredAt).toBeInstanceOf(Date);
  });

  it('exige que la revisión comercial vigente esté confirmada', async () => {
    agreementRepository.findOne.mockResolvedValue({
      id: 302,
      status: ServiceOrderAgreementStatus.DRAFT,
      sequenceNumber: 3,
    });

    await expect(service.deliverItem(order.id, item.id, 22)).rejects.toThrow('acuerdo comercial vigente');
  });

  it('rechaza un equipo que no esté listo o conserve una cancelación pendiente', async () => {
    item.operativeStatus = ServiceOrderOperativeStatus.EN_PROCESO;
    await expect(service.deliverItem(order.id, item.id, 22)).rejects.toThrow('listo para entrega');

    item.operativeStatus = ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA;
    cancellationRepository.findOne.mockResolvedValue({
      id: 401,
      status: ServiceOrderCancellationStatus.PENDING,
    });
    await expect(service.deliverItem(order.id, item.id, 22)).rejects.toThrow('cancelación pendiente');
  });

  it('es idempotente si el equipo ya fue entregado y no duplica evento ni encuesta', async () => {
    const deliveredAt = new Date('2026-08-03T15:30:00.000Z');
    item.operativeStatus = ServiceOrderOperativeStatus.ENTREGADA;
    item.deliveredAt = deliveredAt;

    const result = await service.deliverItem(order.id, item.id, 22);

    expect(item.deliveredAt).toBe(deliveredAt);
    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
    expect(messageMatrix.notifySurveyRequest).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: order.id }));
  });

  it('es idempotente por fecha de entrega aunque el equipo conserve estado cancelado', async () => {
    const deliveredAt = new Date('2026-08-03T15:30:00.000Z');
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
    item.deliveredAt = deliveredAt;

    await service.deliverItem(order.id, item.id, 22);

    expect(item.deliveredAt).toBe(deliveredAt);
    expect(itemRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
  });

  it('no envía encuesta mientras la cabecera siga en entrega parcial', async () => {
    projection.recalculateLocked.mockResolvedValue({
      ...order,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGA_PARCIAL,
      itemProgress: {
        total: 2,
        active: 2,
        resolved: 2,
        readyForPickup: 2,
        delivered: 1,
        cancelled: 0,
        cancellationPending: 0,
        isPartial: true,
      },
    } as ServiceOrder);

    await service.deliverItem(order.id, item.id, 22);

    expect(messageMatrix.notifySurveyRequest).not.toHaveBeenCalled();
  });
});

function createReadyItem(): ServiceOrderItem {
  return {
    id: 201,
    serviceOrderId: 20,
    position: 1,
    code: 'SO-03-08-2026-0001-01',
    operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
    technicalStatus: ServiceOrderTechnicalStatus.RESUELTA,
    commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
    deliveredAt: null,
  } as ServiceOrderItem;
}
