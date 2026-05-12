import { BadRequestException } from '@nestjs/common';
import { ClientContact } from '../../clients/entities/client-contact.entity';
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
import { ServiceOrderMetricsFactory } from './service-order-metrics.factory';
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
  let clientContactRepository: MockRepo<ClientContact>;
  let userRepository: MockRepo<User>;
  let eventRepository: MockRepo<ServiceOrderEvent>;
  let threadRepository: MockRepo;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;
  let metricsFactory: jest.Mocked<ServiceOrderMetricsFactory>;

  beforeEach(() => {
    serviceOrderRepository = createMockRepo<ServiceOrder>();
    clientRepository = createMockRepo<Client>();
    clientContactRepository = createMockRepo<ClientContact>();
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

    metricsFactory = {
      build: jest.fn((serviceOrder: ServiceOrder) => ({
        sla: {
          stage: 'service',
          targetMinutes: 180,
          elapsedMinutes: 60,
          remainingMinutes: 120,
          breached: false,
        },
        timeMetrics: {
          timeToDiagnosis: { valueMinutes: 120, isComputable: true, missingTimestamps: [] },
          timeToServiceStart: { valueMinutes: 240, isComputable: true, missingTimestamps: [] },
          timeToService: { valueMinutes: 150, isComputable: true, missingTimestamps: [] },
          timeToResolution: { valueMinutes: null, isComputable: false, missingTimestamps: ['resolvedAt'] },
          timeToDelivery: { valueMinutes: null, isComputable: false, missingTimestamps: ['deliveredAt'] },
        },
      })),
    } as unknown as jest.Mocked<ServiceOrderMetricsFactory>;

    service = new ServiceOrderService(
      serviceOrderRepository as any,
      clientRepository as any,
      clientContactRepository as any,
      userRepository as any,
      eventRepository as any,
      threadRepository as any,
      workflowService,
      messageMatrixService,
      metricsFactory,
    );
  });

  it('crea muchas ordenes desde un batch reutilizando el contexto compartido', async () => {
    const firstOrder = createServiceOrder({ id: 201, code: 'SO-BATCH-001', clientId: 30, clientContactId: 88 });
    const secondOrder = createServiceOrder({ id: 202, code: 'SO-BATCH-002', clientId: 30, clientContactId: 88 });
    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any);
    clientContactRepository.findOne.mockResolvedValue({
      id: 88,
      clientId: 30,
      name: 'Carlos Avila',
      isPrimary: true,
      isActive: true,
    } as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValueOnce(firstOrder as any)
      .mockResolvedValueOnce(secondOrder as any);

    const result = await service.createBatch(
      {
        sharedContext: {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
          clientContactId: 88,
          priority: ServiceOrderPriority.HIGH,
          contactName: 'Carlos Avila',
        },
        orders: [
          {
            equipmentType: EquipmentType.LAPTOP,
            brand: 'Lenovo',
            initialIssue: 'No enciende',
          },
          {
            equipmentType: EquipmentType.PRINTER,
            brand: 'Epson',
            initialIssue: 'Atasco de papel',
          },
        ],
      },
      5,
    );

    expect(createSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestOrigin: RequestOrigin.CLIENT,
        clientId: 30,
        clientContactId: 88,
        priority: ServiceOrderPriority.HIGH,
        contactName: 'Carlos Avila',
        equipmentType: EquipmentType.LAPTOP,
        brand: 'Lenovo',
        initialIssue: 'No enciende',
      }),
      5,
    );
    expect(createSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestOrigin: RequestOrigin.CLIENT,
        clientId: 30,
        clientContactId: 88,
        priority: ServiceOrderPriority.HIGH,
        contactName: 'Carlos Avila',
        equipmentType: EquipmentType.PRINTER,
        brand: 'Epson',
        initialIssue: 'Atasco de papel',
      }),
      5,
    );
    expect(result.createdOrders).toEqual([firstOrder, secondOrder]);
  });

  it('rechaza batch sin ordenes candidatas', async () => {
    await expect(
      service.createBatch(
        {
          sharedContext: {
            requestOrigin: RequestOrigin.INTERNAL,
          },
          orders: [],
        },
        5,
      ),
    ).rejects.toThrow('At least one order is required');
  });

  it('prevalida todo el batch antes de persistir para evitar creaciones parciales', async () => {
    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.getAssignmentSuggestion
      .mockResolvedValueOnce({
        serviceType: ServiceType.DIAGNOSIS,
        suggestedTechnicianId: 7,
        technicians: [],
      })
      .mockRejectedValueOnce(new BadRequestException('No hay tecnicos disponibles para asignar ordenes'));

    const createSpy = jest.spyOn(service, 'create').mockResolvedValue(createServiceOrder() as any);

    await expect(
      service.createBatch(
        {
          sharedContext: {
            requestOrigin: RequestOrigin.INTERNAL,
          },
          orders: [
            {
              equipmentType: EquipmentType.LAPTOP,
              initialIssue: 'No enciende',
              serviceType: ServiceType.DIAGNOSIS,
            },
            {
              equipmentType: EquipmentType.PRINTER,
              initialIssue: 'Atasco de papel',
              serviceType: ServiceType.STANDARD_SERVICE,
            },
          ],
        },
        5,
      ),
    ).rejects.toThrow('No hay tecnicos disponibles para asignar ordenes');

    expect(createSpy).not.toHaveBeenCalled();
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
      clientSnapshotPhone: '+51999999999',
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
        contactPhone: '+51 999 999 999',
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientContactId: null,
        clientSnapshotName: 'Contacto Manual',
        clientSnapshotEmail: 'contacto@test.com',
        clientSnapshotPhone: '+51999999999',
      }),
    );
  });

  it('usa clientContactId y snapshot del contacto al crear orden para empresa', async () => {
    const client = { id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any;
    const contact = { id: 88, clientId: 30, name: 'Ana Contacto', email: 'ana@corp.com', phone: '+51900111222', isPrimary: true, isActive: true };
    const created = createServiceOrder({
      id: 101,
      clientId: 30,
      clientContactId: 88,
      clientSnapshotName: 'Ana Contacto',
      clientSnapshotEmail: 'ana@corp.com',
      clientSnapshotPhone: '+51900111222',
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue(client);
    clientContactRepository.findOne.mockResolvedValue(contact as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 101 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-003');

    await service.create(
      {
        requestOrigin: RequestOrigin.CLIENT,
        clientId: 30,
        clientContactId: 88,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Empresa',
        serviceType: ServiceType.DIAGNOSIS,
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 30,
        clientContactId: 88,
        clientSnapshotName: 'Ana Contacto',
        clientSnapshotEmail: 'ana@corp.com',
        clientSnapshotPhone: '+51900111222',
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

  it('bloquea la entrega si el acuerdo vigente no está totalmente cubierto', async () => {
    const order = createServiceOrder({
      operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
      montoComprometidoVigente: 120,
      montoReconciliado: 80,
      economicStatus: ServiceOrderEconomicStatus.PARCIAL,
    });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(service.markAsDelivered(order.id, 77)).rejects.toThrow(
      'La orden no puede entregarse hasta cubrir totalmente su acuerdo vigente',
    );
  });

  it('enriquece findOne con sla y timeMetrics listos para UI', async () => {
    const order = createServiceOrder({ technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    const result = await service.findOne(order.id);

    expect(metricsFactory.build).toHaveBeenCalledWith(order);
    expect(result.sla.stage).toBe('service');
    expect(result.timeMetrics.timeToService.valueMinutes).toBe(150);
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
    const order = createServiceOrder({ clientSnapshotPhone: '+51999111222' });
    const updated = createServiceOrder({ clientSnapshotPhone: '+51988777666' });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockResolvedValue(updated);

    await service.update(order.id, { contactPhone: '+51 988 777 666' });

    expect(threadRepository.update).toHaveBeenCalledWith(
      { serviceOrderId: order.id },
      { clientPhoneSnapshot: '+51988777666' },
    );
  });

  it('no toca el hilo si el telefono canonico no cambió', async () => {
    const order = createServiceOrder({ clientSnapshotPhone: '+51999111222' });
    const updated = createServiceOrder({ clientSnapshotPhone: '+51999111222' });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockResolvedValue(updated);

    await service.update(order.id, { contactPhone: '+51 999 111 222' });

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

  it('enriquece findAll con sla y timeMetrics por cada fila', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[createServiceOrder()], 1]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(metricsFactory.build).toHaveBeenCalledTimes(1);
    expect(result.data[0].sla.targetMinutes).toBe(180);
    expect(result.data[0].timeMetrics.timeToDiagnosis.valueMinutes).toBe(120);
  });
});
