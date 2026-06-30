import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderCommercialStatus, ServiceOrderTechnicalStatus } from '../enums';
import { ServiceType } from '../enums/service-type.enum';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderDiagnosisOutcome } from './service-order-diagnosis-outcome.enum';
import { ServiceOrderDiagnosisStatus } from './service-order-diagnosis-status.enum';
import { ServiceOrderDiagnosisService } from './service-order-diagnosis.service';
import { ServiceOrderDiagnosis } from './entities/service-order-diagnosis.entity';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  find: jest.Mock;
  createQueryBuilder: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
  manager: {
    transaction: jest.Mock;
  };
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  manager: {
    transaction: jest.fn(),
  },
});

const createUpdateQueryBuilder = () => ({
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 1,
    code: 'SO-001',
    technicalStatus: ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    serviceType: ServiceType.DIAGNOSIS,
    clientId: 10,
    montoComprometidoVigente: 0,
    montoReconciliado: 0,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  }) as ServiceOrder;

describe('ServiceOrderDiagnosisService', () => {
  let service: ServiceOrderDiagnosisService;
  let diagnosisRepository: MockRepo<ServiceOrderDiagnosis>;
  let serviceOrderRepository: MockRepo<ServiceOrder>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;
  let transactionRepository: MockRepo<ServiceOrderDiagnosis>;

  beforeEach(() => {
    diagnosisRepository = createMockRepo<ServiceOrderDiagnosis>();
    serviceOrderRepository = createMockRepo<ServiceOrder>();
    transactionRepository = createMockRepo<ServiceOrderDiagnosis>();

    diagnosisRepository.manager.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: jest.fn(() => transactionRepository),
      }),
    );

    workflowService = {
      changeTechnicalStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    messageMatrixService = {
      notifyDiagnosisUpdated: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;

    service = new ServiceOrderDiagnosisService(
      diagnosisRepository as any,
      serviceOrderRepository as any,
      workflowService,
      messageMatrixService,
    );
  });

  it('marca reparable como diagnosticada y pendiente de propuesta comercial', async () => {
    const serviceOrder = createServiceOrder();
    const previousDiagnosis = { id: 10, serviceOrderId: serviceOrder.id } as ServiceOrderDiagnosis;
    const newDiagnosis = {
      id: 11,
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 2,
      status: ServiceOrderDiagnosisStatus.CURRENT,
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      summary: 'Requiere cambio de fuente',
    } as ServiceOrderDiagnosis;

    diagnosisRepository.findOne.mockResolvedValue(previousDiagnosis);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);

    const updateQueryBuilder = createUpdateQueryBuilder();
    transactionRepository.createQueryBuilder.mockReturnValue(updateQueryBuilder);
    transactionRepository.save.mockResolvedValue(newDiagnosis);

    await service.create({
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 2,
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      summary: 'Requiere cambio de fuente',
    });

    expect(workflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      serviceOrder.id,
      ServiceOrderTechnicalStatus.DIAGNOSTICADA,
    );
    expect(serviceOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: serviceOrder.id,
        commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
      }),
    );
    expect(messageMatrixService.notifyDiagnosisUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: serviceOrder.id }),
      newDiagnosis,
      previousDiagnosis,
    );
  });

  it('mueve un rediagnóstico reparable desde servicio en ejecución a definición comercial', async () => {
    const serviceOrder = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
      commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
      serviceType: ServiceType.DIAGNOSIS,
    });
    const previousDiagnosis = { id: 20, serviceOrderId: serviceOrder.id } as ServiceOrderDiagnosis;
    const newDiagnosis = {
      id: 21,
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 3,
      status: ServiceOrderDiagnosisStatus.CURRENT,
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      summary: 'Fallo adicional detectado',
    } as ServiceOrderDiagnosis;

    diagnosisRepository.findOne.mockResolvedValue(previousDiagnosis);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);

    const updateQueryBuilder = createUpdateQueryBuilder();
    transactionRepository.createQueryBuilder.mockReturnValue(updateQueryBuilder);
    transactionRepository.save.mockResolvedValue(newDiagnosis);

    await service.create({
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 3,
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      summary: 'Fallo adicional detectado',
    });

    expect(workflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      serviceOrder.id,
      ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
    );
    expect(serviceOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: serviceOrder.id,
        commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
      }),
    );
  });

  it('marca sin solución como estado técnico sin solución y comercial no requiere', async () => {
    const serviceOrder = createServiceOrder();
    const newDiagnosis = {
      id: 12,
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 3,
      status: ServiceOrderDiagnosisStatus.CURRENT,
      outcome: ServiceOrderDiagnosisOutcome.IRREPARABLE,
      summary: 'Placa quemada',
    } as ServiceOrderDiagnosis;

    diagnosisRepository.findOne.mockResolvedValue(null);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);

    const updateQueryBuilder = createUpdateQueryBuilder();
    transactionRepository.createQueryBuilder.mockReturnValue(updateQueryBuilder);
    transactionRepository.save.mockResolvedValue(newDiagnosis);

    await service.create({
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 3,
      outcome: ServiceOrderDiagnosisOutcome.IRREPARABLE,
      summary: 'Placa quemada',
      outcomeReason: 'No tiene reparación viable',
    });

    expect(workflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      serviceOrder.id,
      ServiceOrderTechnicalStatus.SIN_SOLUCION,
    );
    expect(serviceOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: serviceOrder.id,
        commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
      }),
    );
  });

  it('rechaza diagnósticos fuera de la etapa permitida', async () => {
    const serviceOrder = createServiceOrder({
      technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
    });

    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);

    await expect(
      service.create({
        serviceOrderId: serviceOrder.id,
        sequenceNumber: 1,
        outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
        summary: 'Diagnóstico fuera de etapa',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(diagnosisRepository.manager.transaction).not.toHaveBeenCalled();
    expect(workflowService.changeTechnicalStatus).not.toHaveBeenCalled();
    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('impide que un técnico cree diagnósticos para órdenes ajenas', async () => {
    serviceOrderRepository.findOne.mockResolvedValue(createServiceOrder({ assignedToTechnicianId: 5 }));

    await expect(
      service.create(
        {
          serviceOrderId: 1,
          sequenceNumber: 1,
          outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
          summary: 'Intento no autorizado',
        },
        { sub: 9, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(diagnosisRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('permite que recepción con rol técnico adicional cree diagnósticos para órdenes ajenas', async () => {
    const serviceOrder = createServiceOrder({ assignedToTechnicianId: 33 });
    const newDiagnosis = {
      id: 13,
      serviceOrderId: serviceOrder.id,
      sequenceNumber: 4,
      status: ServiceOrderDiagnosisStatus.CURRENT,
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      summary: 'Se puede reparar',
    } as ServiceOrderDiagnosis;

    diagnosisRepository.findOne.mockResolvedValue(null);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);

    const updateQueryBuilder = createUpdateQueryBuilder();
    transactionRepository.createQueryBuilder.mockReturnValue(updateQueryBuilder);
    transactionRepository.save.mockResolvedValue(newDiagnosis);

    await expect(
      service.create(
        {
          serviceOrderId: serviceOrder.id,
          sequenceNumber: 4,
          summary: 'Se puede reparar',
          outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
        },
        { sub: 77, roles: [{ name: 'recepcionist' }, { name: 'technician' }] } as any,
      ),
    ).resolves.toBe(newDiagnosis);
  });
});
