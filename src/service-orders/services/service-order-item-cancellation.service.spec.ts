import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SaleStatus } from '../../sales/enums/sale-status.enum';
import { ServiceOrderItemCancellationRequest } from '../entities/service-order-item-cancellation-request.entity';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderSaleLink } from '../entities/service-order-sale-link.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCancellationChannel,
  ServiceOrderCancellationResolution,
  ServiceOrderCancellationStatus,
} from '../enums';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderAggregateProjectionService } from './service-order-aggregate-projection.service';
import { ServiceOrderItemCancellationService } from './service-order-item-cancellation.service';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementItem } from '../service-agreements/entities/service-agreement-item.entity';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';

describe('ServiceOrderItemCancellationService', () => {
  let service: ServiceOrderItemCancellationService;
  let order: ServiceOrder;
  let item: ServiceOrderItem;
  let orderRepository: any;
  let itemRepository: any;
  let requestRepository: any;
  let eventRepository: any;
  let saleLinkRepository: any;
  let versionRepository: any;
  let lineRepository: any;
  let agreementRepository: any;
  let agreementItemRepository: any;
  let manager: any;
  let projection: jest.Mocked<ServiceOrderAggregateProjectionService>;

  beforeEach(() => {
    order = { id: 20, assignedToTechnicianId: 7 } as ServiceOrder;
    item = createItem();
    orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    };
    itemRepository = {
      findOne: jest.fn().mockResolvedValue(item),
      find: jest.fn().mockResolvedValue([item]),
      save: jest.fn(async (value) => value),
    };
    requestRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 501, ...value })),
    };
    eventRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    saleLinkRepository = { find: jest.fn().mockResolvedValue([]) };
    versionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 601,
        serviceOrderItemId: item.id,
        versionNumber: 2,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        totalAmount: 180,
      }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 602, ...value })),
    };
    lineRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 603, ...value })),
    };
    const agreementUpdateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    agreementRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 701, sequenceNumber: 3 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 702, ...value })),
      createQueryBuilder: jest.fn(() => agreementUpdateBuilder),
    };
    agreementItemRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    manager = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrder) return orderRepository;
        if (entity === ServiceOrderItem) return itemRepository;
        if (entity === ServiceOrderItemCancellationRequest)
          return requestRepository;
        if (entity === ServiceOrderEvent) return eventRepository;
        if (entity === ServiceOrderSaleLink) return saleLinkRepository;
        if (entity === ServiceOrderItemCommercialVersion)
          return versionRepository;
        if (entity === ServiceOrderItemCommercialLine) return lineRepository;
        if (entity === ServiceOrderAgreement) return agreementRepository;
        if (entity === ServiceOrderAgreementItem)
          return agreementItemRepository;
        throw new Error(`Unexpected repository ${entity?.name}`);
      }),
    };
    projection = {
      recalculateLocked: jest
        .fn()
        .mockResolvedValue({ ...order, items: [item] }),
    } as unknown as jest.Mocked<ServiceOrderAggregateProjectionService>;
    service = new ServiceOrderItemCancellationService(manager, projection);
  });

  it('crea y aprueba atómicamente una cancelación anterior a la ejecución', async () => {
    const result = await service.requestCancellation(
      order.id,
      item.id,
      {
        channel: ServiceOrderCancellationChannel.WHATSAPP,
        reason: 'El cliente desistió.',
      },
      7,
      { sub: 7, roles: [{ name: 'technician' }] } as any,
    );

    expect(result.request).toEqual(
      expect.objectContaining({
        status: ServiceOrderCancellationStatus.APPROVED,
        resolution: ServiceOrderCancellationResolution.APPROVED_WITHOUT_CHARGE,
        requestedByUserId: 7,
        resolvedByUserId: 7,
        channel: ServiceOrderCancellationChannel.WHATSAPP,
        reason: 'El cliente desistió.',
      }),
    );
    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(item.cancelledAt).toBeInstanceOf(Date);
    expect(projection.recalculateLocked).toHaveBeenCalledWith(
      manager,
      order.id,
    );
  });

  it('cancela varios equipos y cobra S/ 20 por cada diagnóstico iniciado', async () => {
    const assignedItem = createItem();
    const diagnosedItem = {
      ...createItem(),
      id: 202,
      position: 2,
      code: 'OS-03-08-2026-0001-02',
      technicalStatus: ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    } as ServiceOrderItem;
    itemRepository.find.mockResolvedValue([assignedItem, diagnosedItem]);
    versionRepository.findOne.mockResolvedValue(null);

    const result = await service.requestCancellations(
      order.id,
      {
        itemIds: [assignedItem.id, diagnosedItem.id],
        channel: ServiceOrderCancellationChannel.WHATSAPP,
        reason: 'El cliente solicita cancelar ambos equipos.',
        customerChargeAcknowledged: true,
      },
      7,
      { sub: 7, roles: [{ name: 'technician' }] } as any,
    );

    expect(result.requests).toHaveLength(2);
    expect(result.chargedItemsCount).toBe(1);
    expect(result.chargeTotal).toBe(20);
    expect(assignedItem.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELADA,
    );
    expect(diagnosedItem.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELADA,
    );
    expect(versionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderItemId: diagnosedItem.id,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        totalAmount: 20,
      }),
    );
    expect(lineRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogNameSnapshot: 'Servicio técnico de diagnóstico',
        netAmount: 20,
      }),
    );
    expect(agreementRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'CONFIRMED',
        totalAmount: 20,
      }),
    );
  });

  it('exige constancia del cargo y no persiste una cancelación diagnosticada', async () => {
    item.technicalStatus = ServiceOrderTechnicalStatus.EN_DIAGNOSTICO;
    item.operativeStatus = ServiceOrderOperativeStatus.EN_PROCESO;
    itemRepository.find.mockResolvedValue([item]);

    await expect(
      service.requestCancellations(
        order.id,
        {
          itemIds: [item.id],
          channel: ServiceOrderCancellationChannel.IN_PERSON,
          reason: 'El cliente solicita cancelar.',
          customerChargeAcknowledged: false,
        },
        7,
      ),
    ).rejects.toThrow('cliente fue informado');

    expect(requestRepository.save).not.toHaveBeenCalled();
    expect(versionRepository.save).not.toHaveBeenCalled();
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza todo el lote cuando un equipo ya tiene cancelación pendiente', async () => {
    const secondItem = { ...createItem(), id: 202, position: 2 } as ServiceOrderItem;
    itemRepository.find.mockResolvedValue([item, secondItem]);
    requestRepository.find.mockResolvedValue([createPendingRequest()]);

    await expect(
      service.requestCancellations(
        order.id,
        {
          itemIds: [item.id, secondItem.id],
          channel: ServiceOrderCancellationChannel.PHONE,
          reason: 'Cancelar los equipos.',
        },
        7,
      ),
    ).rejects.toThrow('solicitud de cancelación pendiente');

    expect(requestRepository.save).not.toHaveBeenCalled();
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  it('cancela inmediatamente con S/ 20 después de iniciar la ejecución', async () => {
    item.technicalStatus = ServiceOrderTechnicalStatus.EN_EJECUCION;
    item.operativeStatus = ServiceOrderOperativeStatus.EN_PROCESO;
    item.serviceStartedAt = new Date('2026-08-03T10:00:00.000Z');

    const result = await service.requestCancellation(
      order.id,
      item.id,
      {
        channel: ServiceOrderCancellationChannel.PHONE,
        reason: 'Solicitó detener el trabajo.',
        customerChargeAcknowledged: true,
      },
      7,
      { sub: 7, roles: [{ name: 'technician' }] } as any,
    );

    expect(result.request.status).toBe(ServiceOrderCancellationStatus.APPROVED);
    expect(result.request.resolution).toBe(
      ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE,
    );
    expect(result.request.chargeAmount).toBe(20);
    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(item.cancelledAt).toBeInstanceOf(Date);
  });

  it('rechaza una solicitud tardía y restaura el estado operativo previo', async () => {
    const pending = createPendingRequest();
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    requestRepository.findOne.mockResolvedValue(pending);

    const result = await service.resolveCancellation(
      order.id,
      item.id,
      pending.id,
      {
        resolution: ServiceOrderCancellationResolution.REJECTED,
        reason: 'Se continuará con la reparación.',
      },
      3,
      { sub: 3, roles: [{ name: 'supervisor' }] } as any,
    );

    expect(result.request.status).toBe(ServiceOrderCancellationStatus.REJECTED);
    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.EN_PROCESO);
    expect(item.cancelledAt).toBeNull();
  });

  it('aprueba sin cobro una solicitud tardía y cancela solo el equipo', async () => {
    const pending = createPendingRequest();
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    requestRepository.findOne.mockResolvedValue(pending);

    const result = await service.resolveCancellation(
      order.id,
      item.id,
      pending.id,
      {
        resolution: ServiceOrderCancellationResolution.APPROVED_WITHOUT_CHARGE,
        reason: 'Cancelación autorizada.',
      },
      3,
      { sub: 3, roles: [{ name: 'supervisor' }] } as any,
    );

    expect(result.request.status).toBe(ServiceOrderCancellationStatus.APPROVED);
    expect(item.operativeStatus).toBe(ServiceOrderOperativeStatus.CANCELADA);
    expect(item.cancelledAt).toBeInstanceOf(Date);
  });

  it('crea un ajuste comercial y espera aceptación del cliente cuando aprueba con cobro', async () => {
    const pending = createPendingRequest();
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    item.technicalStatus = ServiceOrderTechnicalStatus.EN_EJECUCION;
    requestRepository.findOne.mockResolvedValue(pending);

    const result = await service.resolveCancellation(
      order.id,
      item.id,
      pending.id,
      {
        resolution: ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE,
        chargeAmount: 45.5,
        reason: 'Cobro por diagnóstico y trabajo realizado.',
      },
      3,
      { sub: 3, roles: [{ name: 'supervisor' }] } as any,
    );

    expect(result.request).toEqual(
      expect.objectContaining({
        status: ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
        resolution: ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE,
        chargeAmount: 45.5,
        commercialVersionId: 602,
        resolvedAt: null,
      }),
    );
    expect(lineRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogNameSnapshot: 'Cargo por trabajo realizado',
        netAmount: 45.5,
      }),
    );
    expect(agreementRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalAmount: 45.5 }),
    );
    expect(item.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
    );
    expect(item.cancelledAt).toBeNull();
  });

  it('bloquea la aprobación si la orden conserva una venta confirmada', async () => {
    const pending = createPendingRequest();
    item.operativeStatus = ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    requestRepository.findOne.mockResolvedValue(pending);
    saleLinkRepository.find.mockResolvedValue([
      { sale: { status: SaleStatus.CONFIRMED } },
    ]);

    await expect(
      service.resolveCancellation(
        order.id,
        item.id,
        pending.id,
        {
          resolution:
            ServiceOrderCancellationResolution.APPROVED_WITHOUT_CHARGE,
          reason: 'Autorizada.',
        },
        3,
        { sub: 3, roles: [{ name: 'supervisor' }] } as any,
      ),
    ).rejects.toThrow('venta confirmada');

    expect(item.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
    );
  });

  it('impide que un técnico solicite cancelación en una orden ajena', async () => {
    await expect(
      service.requestCancellation(
        order.id,
        item.id,
        {
          channel: ServiceOrderCancellationChannel.OTHER,
          reason: 'Solicitud recibida.',
        },
        99,
        { sub: 99, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(itemRepository.findOne).not.toHaveBeenCalled();
  });

  it('rechaza una segunda solicitud mientras existe otra pendiente', async () => {
    requestRepository.find.mockResolvedValue([createPendingRequest()]);

    await expect(
      service.requestCancellation(
        order.id,
        item.id,
        {
          channel: ServiceOrderCancellationChannel.IN_PERSON,
          reason: 'Solicitud duplicada.',
        },
        3,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  function createPendingRequest(): ServiceOrderItemCancellationRequest {
    return {
      id: 501,
      serviceOrderItemId: item.id,
      status: ServiceOrderCancellationStatus.PENDING,
      resolution: null,
      channel: ServiceOrderCancellationChannel.PHONE,
      reason: 'Detener reparación.',
      requestedByUserId: 7,
      requestedAt: new Date('2026-08-03T11:00:00.000Z'),
      previousOperativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
      previousTechnicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
      resolvedByUserId: null,
      resolvedAt: null,
      resolutionReason: null,
      chargeAmount: null,
      commercialVersionId: null,
    } as ServiceOrderItemCancellationRequest;
  }
});

function createItem(): ServiceOrderItem {
  return {
    id: 201,
    serviceOrderId: 20,
    code: 'OS-03-08-2026-0001-01',
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
    commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
    serviceStartedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
  } as ServiceOrderItem;
}
