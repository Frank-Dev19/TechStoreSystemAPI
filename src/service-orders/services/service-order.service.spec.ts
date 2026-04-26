import { BadRequestException } from '@nestjs/common';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  EquipmentType,
  RequestOrigin,
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderService } from './service-order.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
  update: jest.Mock;
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  update: jest.fn(),
});

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 1,
    code: 'SO-001',
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    technicalStatus: ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
    priority: ServiceOrderPriority.MEDIUM,
    requestOrigin: RequestOrigin.INTERNAL,
    equipmentType: EquipmentType.LAPTOP,
    equipmentTypeOther: null,
    brand: null,
    model: null,
    serialNumber: null,
    accessories: null,
    serviceType: ServiceType.DIAGNOSIS,
    initialIssue: 'No enciende',
    estimatedRepairHours: null,
    assignedTechnician: null,
    assignedToTechnicianId: null,
    assignedAt: null,
    client: null,
    clientId: null,
    clientSnapshotName: null,
    clientSnapshotDocumentTypeName: null,
    clientSnapshotDocumentNumber: null,
    clientSnapshotPhone: null,
    clientSnapshotEmail: null,
    creator: undefined as any,
    createdBy: 5,
    closer: null,
    closedBy: null,
    canceller: null,
    cancelledBy: null,
    estimatedDeliveryDate: null,
    receivedAt: new Date('2026-01-01T10:00:00.000Z'),
    reviewStartedAt: null,
    serviceStartedAt: null,
    serviceCompletedAt: null,
    readyForPickupAt: null,
    resolvedAt: null,
    deliveredAt: null,
    closedAt: null,
    cancelledAt: null,
    notes: null,
    montoComprometidoVigente: 0,
    montoReconciliado: 0,
    discount: 0,
    cancellationReason: null,
    rating: null,
    ratingComment: null,
    ratedAt: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrder;

describe('ServiceOrderService', () => {
  let service: ServiceOrderService;
  let serviceOrderRepository: MockRepo<ServiceOrder>;
  let clientRepository: MockRepo<Client>;
  let userRepository: MockRepo<User>;
  let eventRepository: MockRepo<ServiceOrderEvent>;
  let threadRepository: MockRepo;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;

  beforeEach(() => {
    serviceOrderRepository = createMockRepo<ServiceOrder>();
    clientRepository = createMockRepo<Client>();
    userRepository = createMockRepo<User>();
    eventRepository = createMockRepo<ServiceOrderEvent>();
    threadRepository = createMockRepo();

    workflowService = {
      ensureTechnicianAvailable: jest.fn(),
      getAssignmentSuggestion: jest.fn(),
      registerInitialAssignment: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    messageMatrixService = {
      notifySurveyRequest: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;

    service = new ServiceOrderService(
      serviceOrderRepository as any,
      clientRepository as any,
      userRepository as any,
      eventRepository as any,
      threadRepository as any,
      workflowService,
      messageMatrixService,
    );
  });

  it('crea la orden con los ejes canónicos iniciales', async () => {
    const created = createServiceOrder({
      id: 99,
      code: 'SO-TEST-001',
      technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      serviceType: ServiceType.STANDARD_SERVICE,
      assignedToTechnicianId: 7,
      assignedAt: new Date('2026-01-01T10:00:00.000Z'),
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.ensureTechnicianAvailable.mockResolvedValue({ id: 7 } as User);
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 99 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-001');

    await service.create(
      {
        requestOrigin: RequestOrigin.INTERNAL,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Requiere mantenimiento',
        serviceType: ServiceType.STANDARD_SERVICE,
        assignedToTechnicianId: 7,
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
        technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
        commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
        economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
        montoComprometidoVigente: 0,
        montoReconciliado: 0,
      }),
    );
    expect(workflowService.registerInitialAssignment).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }), 5);
  });

  it('persiste datos de contacto en el snapshot al crear la orden', async () => {
    const created = createServiceOrder({
      id: 100,
      code: 'SO-TEST-002',
      clientSnapshotName: 'Contacto Manual',
      clientSnapshotEmail: 'contacto@test.com',
      clientSnapshotPhone: '999999999',
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 100 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-002');

    await service.create(
      {
        requestOrigin: RequestOrigin.INTERNAL,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Revisión preventiva',
        serviceType: ServiceType.DIAGNOSIS,
        contactName: 'Contacto Manual',
        contactEmail: 'contacto@test.com',
        contactPhone: '999999999',
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSnapshotName: 'Contacto Manual',
        clientSnapshotEmail: 'contacto@test.com',
        clientSnapshotPhone: '999999999',
      }),
    );
  });

  it('al marcar como entregada asigna deliveredAt y notifica encuesta', async () => {
    const order = createServiceOrder({ deliveredAt: null, operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    eventRepository.create.mockImplementation((value) => value);

    const result = await service.markAsDelivered(order.id, 77);

    expect(result.deliveredAt).toBeInstanceOf(Date);
    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: order.id,
        eventType: 'operative.delivered',
        axis: 'operativo',
        capability: 'delivery',
        fromStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
        toStatus: ServiceOrderOperativeStatus.ENTREGADA,
        actorId: 77,
      }),
    );
    expect(messageMatrixService.notifySurveyRequest).toHaveBeenCalledWith(result);
  });

  it('no pisa deliveredAt existente al volver a marcar una orden entregada', async () => {
    const deliveredAt = new Date('2026-01-03T12:00:00.000Z');
    const order = createServiceOrder({ deliveredAt, operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    eventRepository.create.mockImplementation((value) => value);

    const result = await service.markAsDelivered(order.id);

    expect(result.deliveredAt).toBe(deliveredAt);
    expect(messageMatrixService.notifySurveyRequest).toHaveBeenCalledWith(result);
  });

  it('rechaza la mutación directa de operativeStatus desde update', async () => {
    const order = createServiceOrder({ operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.update(order.id, { operativeStatus: ServiceOrderOperativeStatus.ENTREGADA } as any),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza la mutación directa de serviceType desde update', async () => {
    const order = createServiceOrder({ serviceType: ServiceType.DIAGNOSIS });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.update(order.id, { serviceType: ServiceType.STANDARD_SERVICE } as any),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza la mutación directa de assignedToTechnicianId desde update', async () => {
    const order = createServiceOrder({ assignedToTechnicianId: 4 });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.update(order.id, { assignedToTechnicianId: 12 } as any),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('resincroniza el telefono del hilo cuando cambia el contacto de la orden', async () => {
    const order = createServiceOrder({ clientSnapshotPhone: '999 111 222' });
    const updated = createServiceOrder({ clientSnapshotPhone: '988777666' });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockResolvedValue(updated);

    await service.update(order.id, { contactPhone: '988-777-666' });

    expect(threadRepository.update).toHaveBeenCalledWith(
      { serviceOrderId: order.id },
      { clientPhoneSnapshot: '988777666' },
    );
  });

  it('no toca el hilo si el telefono canonico no cambió', async () => {
    const order = createServiceOrder({ clientSnapshotPhone: '999111222' });
    const updated = createServiceOrder({ clientSnapshotPhone: '999111222' });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockResolvedValue(updated);

    await service.update(order.id, { contactPhone: '999 111 222' });

    expect(threadRepository.update).not.toHaveBeenCalled();
  });

  it('aplica filtros canónicos al listado cuando se consultan estados', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll({
      page: 1,
      limit: 10,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
      technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
      economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.operativeStatus IN (:...operativeStatuses)', {
      operativeStatuses: [ServiceOrderOperativeStatus.ENTREGADA],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.technicalStatus IN (:...technicalStatuses)', {
      technicalStatuses: [ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.commercialStatus IN (:...commercialStatuses)', {
      commercialStatuses: [ServiceOrderCommercialStatus.AUTORIZADA],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.economicStatus IN (:...economicStatuses)', {
      economicStatuses: [ServiceOrderEconomicStatus.PENDIENTE],
    });
  });
});
