import { BadRequestException } from '@nestjs/common';
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
});
