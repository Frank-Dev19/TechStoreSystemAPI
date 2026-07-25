import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { TechnicianAssignmentBalance } from '../entities/technician-assignment-balance.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderTransitionPolicy } from '../state-machines/service-order-transition-policy';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';

type MockRepo<T = any> = {
  manager?: any;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  find: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  update: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 1,
    code: 'SO-001',
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
    priority: ServiceOrderPriority.MEDIUM,
    requestOrigin: undefined as any,
    equipmentType: undefined as any,
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
    createdBy: 1,
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

describe('ServiceOrderWorkflowService', () => {
  let service: ServiceOrderWorkflowService;
  let serviceOrderRepository: MockRepo<ServiceOrder>;
  let eventRepository: MockRepo<ServiceOrderEvent>;
  let balanceRepository: MockRepo<TechnicianAssignmentBalance>;
  let userRepository: MockRepo;
  let transitionPolicy: jest.Mocked<ServiceOrderTransitionPolicy>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;

  beforeEach(() => {
    serviceOrderRepository = createMockRepo<ServiceOrder>();
    eventRepository = createMockRepo<ServiceOrderEvent>();
    balanceRepository = createMockRepo<TechnicianAssignmentBalance>();
    userRepository = createMockRepo();
    const transactionManager = {
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrder) return serviceOrderRepository;
        if (entity === ServiceOrderEvent) return eventRepository;
        if (entity === TechnicianAssignmentBalance) return balanceRepository;
        return userRepository;
      }),
    };
    serviceOrderRepository.manager = {
      transaction: jest.fn(async (callback) => callback(transactionManager)),
    };

    transitionPolicy = {
      canTransition: jest.fn(),
      assertTransition: jest.fn(),
      getAllowedTransitions: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderTransitionPolicy>;

    messageMatrixService = {
      notifyWorkflowTransition: jest.fn(),
      notifyInitialAssignment: jest.fn(),
      notifyTechnicianReassignment: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;

    service = new ServiceOrderWorkflowService(
      serviceOrderRepository as any,
      eventRepository as any,
      balanceRepository as any,
      userRepository as any,
      transitionPolicy,
      messageMatrixService,
    );
  });

  it('permite una transición técnica válida y registra auditoría', async () => {
    const order = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
      operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    });

    serviceOrderRepository.findOne
      .mockResolvedValueOnce(order)
      .mockImplementationOnce(async () => order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const result = await service.changeTechnicalStatus(order.id, ServiceOrderTechnicalStatus.EN_DIAGNOSTICO, 99, 'Inicia revisión');

    expect(transitionPolicy.assertTransition).toHaveBeenCalledWith(
      'tecnico',
      ServiceOrderTechnicalStatus.ASIGNADA,
      ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
    );
    expect(serviceOrderRepository.save).toHaveBeenCalled();
    expect(result.technicalStatus).toBe(ServiceOrderTechnicalStatus.EN_DIAGNOSTICO);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.EN_PROCESO);
    expect(result.reviewStartedAt).toBeInstanceOf(Date);
    expect(eventRepository.save).toHaveBeenCalled();
    expect(messageMatrixService.notifyWorkflowTransition).toHaveBeenCalledWith(
      expect.objectContaining({ id: order.id }),
      ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
    );
  });

  it('uses the provided transaction manager repositories for assignment suggestions', async () => {
    const managerServiceOrderRepository = createMockRepo<ServiceOrder>();
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === ServiceOrder.name) {
          return managerServiceOrderRepository;
        }
        throw new Error(`Unexpected repository request for ${entity?.name ?? 'unknown entity'}`);
      }),
    };

    userRepository.createQueryBuilder.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 7, name: 'Carlos Rojas' },
        { id: 8, name: 'Ana Torres' },
      ]),
    });
    managerServiceOrderRepository.find.mockResolvedValue([
      {
        assignedToTechnicianId: 7,
        serviceType: ServiceType.DIAGNOSIS,
        technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
        assignedAt: new Date('2026-01-05T08:30:00.000Z'),
      },
    ]);

    const result = await service.getAssignmentSuggestion(ServiceType.DIAGNOSIS, manager as any);

    expect(result.suggestedTechnicianId).toBe(8);
    expect(manager.getRepository).toHaveBeenCalledWith(ServiceOrder);
    expect(managerServiceOrderRepository.find).toHaveBeenCalledWith({
      where: { assignedToTechnicianId: expect.anything() },
      select: {
        assignedToTechnicianId: true,
        serviceType: true,
        technicalStatus: true,
        assignedAt: true,
      },
    });
    expect(serviceOrderRepository.find).not.toHaveBeenCalled();
  });

  it('uses the provided transaction manager repositories for initial assignment side effects', async () => {
    const managerBalanceRepository = createMockRepo<TechnicianAssignmentBalance>();
    const managerEventRepository = createMockRepo<ServiceOrderEvent>();
    const manager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === TechnicianAssignmentBalance.name) {
          return managerBalanceRepository;
        }
        if (entity?.name === ServiceOrderEvent.name) {
          return managerEventRepository;
        }
        throw new Error(`Unexpected repository request for ${entity?.name ?? 'unknown entity'}`);
      }),
    };
    const assignedAt = new Date('2026-01-05T08:30:00.000Z');
    const order = createServiceOrder({
      id: 77,
      assignedToTechnicianId: 12,
      assignedAt,
      technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
    });
    const balance = {
      technicianId: 12,
      serviceType: order.serviceType,
      assignedCount: 0,
      activeCount: 0,
      lastAssignedAt: null,
    } as TechnicianAssignmentBalance;

    managerBalanceRepository.find.mockResolvedValue([
      { technicianId: 12, serviceType: ServiceType.DIAGNOSIS } as TechnicianAssignmentBalance,
      { technicianId: 12, serviceType: ServiceType.STANDARD_SERVICE } as TechnicianAssignmentBalance,
      { technicianId: 12, serviceType: ServiceType.WARRANTY_SERVICE } as TechnicianAssignmentBalance,
      { technicianId: 12, serviceType: ServiceType.ASSEMBLY } as TechnicianAssignmentBalance,
      { technicianId: 12, serviceType: ServiceType.CUSTOMER_SERVICE } as TechnicianAssignmentBalance,
    ]);
    managerBalanceRepository.findOne.mockResolvedValue(balance);
    managerBalanceRepository.save.mockImplementation(async (entity) => entity);
    managerEventRepository.save.mockImplementation(async (entity) => entity);

    await service.registerInitialAssignment(order, 99, manager as any);

    expect(manager.getRepository).toHaveBeenCalledWith(TechnicianAssignmentBalance);
    expect(manager.getRepository).toHaveBeenCalledWith(ServiceOrderEvent);
    expect(balanceRepository.find).not.toHaveBeenCalled();
    expect(balanceRepository.findOne).not.toHaveBeenCalled();
    expect(balanceRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
    expect(managerBalanceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        technicianId: 12,
        serviceType: order.serviceType,
        assignedCount: 1,
        activeCount: 1,
        lastAssignedAt: assignedAt,
      }),
    );
    expect(managerEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: order.id,
        eventType: 'assigned',
        actorId: 99,
      }),
    );
    expect(managerEventRepository.save).toHaveBeenCalled();
  });

  it('rechaza una transición técnica inválida sin persistir cambios', async () => {
    const order = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
      operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    });

    serviceOrderRepository.findOne.mockResolvedValue(order);
    transitionPolicy.assertTransition.mockImplementation(() => {
      throw new BadRequestException('invalid transition');
    });

    await expect(
      service.changeTechnicalStatus(order.id, ServiceOrderTechnicalStatus.RESUELTA, 99),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
    expect(eventRepository.save).not.toHaveBeenCalled();
    expect(messageMatrixService.notifyWorkflowTransition).not.toHaveBeenCalled();
  });

  it('al resolver técnicamente deja la orden lista para entrega', async () => {
    const order = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    });

    serviceOrderRepository.findOne
      .mockResolvedValueOnce(order)
      .mockImplementationOnce(async () => order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const result = await service.changeTechnicalStatus(order.id, ServiceOrderTechnicalStatus.RESUELTA, 55, 'Servicio completado');

    expect(result.technicalStatus).toBe(ServiceOrderTechnicalStatus.RESUELTA);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA);
    expect(result.resolvedAt).toBeInstanceOf(Date);
    expect(result.readyForPickupAt).toBeInstanceOf(Date);
    expect(result.serviceCompletedAt).toBeInstanceOf(Date);
  });

  it('mantiene serviceStartedAt existente al volver a ejecutar una transición de ejecución', async () => {
    const serviceStartedAt = new Date('2026-01-01T12:00:00.000Z');
    const order = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
      serviceStartedAt,
    });

    serviceOrderRepository.findOne
      .mockResolvedValueOnce(order)
      .mockImplementationOnce(async () => order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const result = await service.changeTechnicalStatus(
      order.id,
      ServiceOrderTechnicalStatus.EN_EJECUCION,
      55,
      'Retoma ejecución',
    );

    expect(result.serviceStartedAt).toBe(serviceStartedAt);
  });

  it('al cerrar sin solución marca el estado operativo y guarda motivo', async () => {
    const order = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    });

    serviceOrderRepository.findOne
      .mockResolvedValueOnce(order)
      .mockImplementationOnce(async () => order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const result = await service.changeTechnicalStatus(order.id, ServiceOrderTechnicalStatus.SIN_SOLUCION, 77, 'Equipo irreparable');

    expect(result.technicalStatus).toBe(ServiceOrderTechnicalStatus.SIN_SOLUCION);
    expect(result.operativeStatus).toBe(ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION);
    expect(result.cancellationReason).toBe('Equipo irreparable');
    expect(result.resolvedAt).toBeInstanceOf(Date);
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it('impide que un técnico cambie el workflow de una orden ajena', async () => {
    const order = createServiceOrder({ assignedToTechnicianId: 12 });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.changeTechnicalStatus(
        order.id,
        ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
        12,
        undefined,
        { sub: 99, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('permite que supervisor con rol técnico adicional cambie el workflow de una orden ajena', async () => {
    const order = createServiceOrder({ assignedToTechnicianId: 12 });
    serviceOrderRepository.findOne
      .mockResolvedValueOnce(order)
      .mockImplementationOnce(async () => order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    await expect(
      service.changeTechnicalStatus(
        order.id,
        ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
        99,
        undefined,
        { sub: 99, roles: [{ name: 'supervisor' }, { name: 'technician' }] } as any,
      ),
    ).resolves.toEqual(expect.objectContaining({ technicalStatus: ServiceOrderTechnicalStatus.EN_DIAGNOSTICO }));

    expect(serviceOrderRepository.save).toHaveBeenCalled();
  });
});
