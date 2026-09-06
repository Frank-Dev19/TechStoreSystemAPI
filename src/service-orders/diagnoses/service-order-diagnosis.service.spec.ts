import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { EquipmentType } from '../enums/equipment-type.enum';
import { ServiceType } from '../enums/service-type.enum';
import { ServiceOrderItemWorkflowService } from '../services/service-order-item-workflow.service';
import { ServiceOrderItemCommercialVersionService } from '../services/service-order-item-commercial-version.service';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderDiagnosisOutcome } from './service-order-diagnosis-outcome.enum';
import { ServiceOrderDiagnosisStatus } from './service-order-diagnosis-status.enum';
import { ServiceOrderDiagnosisService } from './service-order-diagnosis.service';
import { ServiceOrderDiagnosis } from './entities/service-order-diagnosis.entity';

type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
  manager: { transaction: jest.Mock };
};

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  manager: { transaction: jest.fn() },
});

const createUpdateQueryBuilder = () => ({
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

const createOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 10,
    code: 'SO-03-08-2026-0001',
    assignedToTechnicianId: 5,
    serviceType: ServiceType.DIAGNOSIS,
    technicalStatus: ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    ...overrides,
  }) as ServiceOrder;

const createItem = (
  order: ServiceOrder,
  overrides: Partial<ServiceOrderItem> = {},
): ServiceOrderItem =>
  ({
    id: 101,
    serviceOrderId: order.id,
    serviceOrder: order,
    position: 1,
    code: `${order.code}-01`,
    equipmentType: EquipmentType.LAPTOP,
    equipmentTypeOther: null,
    brand: 'Lenovo',
    model: 'T14',
    serialNumber: 'SER-1',
    serialNumberNormalized: 'SER-1',
    accessories: null,
    initialIssue: 'No enciende',
    notes: null,
    priority: ServiceOrderPriority.LOW,
    operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    technicalStatus: ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    estimatedRepairHours: null,
    estimatedDeliveryDate: null,
    reviewStartedAt: null,
    serviceStartedAt: null,
    serviceCompletedAt: null,
    readyForPickupAt: null,
    resolvedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancellationReason: null,
    warrantySourceItemId: null,
    warrantySourceItem: null,
    commercialVersions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrderItem;

describe('ServiceOrderDiagnosisService', () => {
  let service: ServiceOrderDiagnosisService;
  let diagnosisRepository: MockRepo;
  let orderRepository: MockRepo;
  let itemRepository: MockRepo;
  let diagnosisRepositoryInTx: MockRepo;
  let itemWorkflowService: jest.Mocked<ServiceOrderItemWorkflowService>;
  let commercialVersionService: jest.Mocked<ServiceOrderItemCommercialVersionService>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;
  let warrantiesService: { consumeForDiagnosis: jest.Mock };

  beforeEach(() => {
    diagnosisRepository = createMockRepo();
    orderRepository = createMockRepo();
    itemRepository = createMockRepo();
    diagnosisRepositoryInTx = createMockRepo();

    diagnosisRepository.manager.transaction.mockImplementation(
      async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === ServiceOrder) return orderRepository;
            if (entity === ServiceOrderItem) return itemRepository;
            return diagnosisRepositoryInTx;
          }),
        }),
    );

    itemWorkflowService = {
      changeTechnicalStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderItemWorkflowService>;
    commercialVersionService = {
      createRediagnosisDraft: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderItemCommercialVersionService>;
    messageMatrixService = {
      notifyDiagnosisUpdated: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;
    warrantiesService = { consumeForDiagnosis: jest.fn() };

    service = new ServiceOrderDiagnosisService(
      diagnosisRepository as any,
      itemWorkflowService,
      commercialVersionService,
      messageMatrixService,
      warrantiesService as any,
    );
  });

  it('registra el diagnóstico solo en el item indicado y proyecta la cabecera en la misma transacción', async () => {
    const order = createOrder();
    const item = createItem(order);
    const sibling = createItem(order, {
      id: 102,
      position: 2,
      code: `${order.code}-02`,
    });
    const previous = {
      id: 1,
      serviceOrderItemId: item.id,
    } as ServiceOrderDiagnosis;
    const saved = {
      id: 2,
      serviceOrderItemId: item.id,
      serviceOrderItem: item,
      sequenceNumber: 2,
      status: ServiceOrderDiagnosisStatus.CURRENT,
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      summary: 'Requiere cambio de fuente',
    } as ServiceOrderDiagnosis;
    const projected = createOrder({
      technicalStatus: ServiceOrderTechnicalStatus.DIAGNOSTICADA,
    });

    itemRepository.findOne.mockResolvedValue(item);
    orderRepository.findOne.mockResolvedValue(order);
    diagnosisRepositoryInTx.findOne.mockResolvedValue(previous);
    diagnosisRepositoryInTx.createQueryBuilder.mockReturnValue(
      createUpdateQueryBuilder(),
    );
    diagnosisRepositoryInTx.save.mockResolvedValue(saved);
    itemRepository.save.mockResolvedValue(item);
    itemWorkflowService.changeTechnicalStatus.mockResolvedValue(projected);

    await expect(
      service.create({
        serviceOrderItemId: item.id,
        sequenceNumber: 2,
        outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
        summary: 'Requiere cambio de fuente',
      }),
    ).resolves.toBe(saved);

    expect(diagnosisRepositoryInTx.create).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderItemId: item.id }),
    );
    expect(itemRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: item.id,
        commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
      }),
    );
    expect(itemWorkflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      order.id,
      item.id,
      ServiceOrderTechnicalStatus.DIAGNOSTICADA,
      undefined,
      undefined,
      undefined,
      expect.anything(),
    );
    expect(sibling.commercialStatus).toBe(
      ServiceOrderCommercialStatus.NO_REQUIERE,
    );
    expect(messageMatrixService.notifyDiagnosisUpdated).toHaveBeenCalledWith(
      projected,
      saved,
      previous,
    );
  });

  it('supersede y numera diagnósticos por item, no por orden', async () => {
    const order = createOrder();
    const item = createItem(order);
    const queryBuilder = createUpdateQueryBuilder();
    const sequenceQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '3' }),
    };

    itemRepository.findOne.mockResolvedValue(item);
    orderRepository.findOne.mockResolvedValue(order);
    diagnosisRepositoryInTx.findOne.mockResolvedValue(null);
    diagnosisRepositoryInTx.createQueryBuilder
      .mockReturnValueOnce(sequenceQueryBuilder)
      .mockReturnValueOnce(queryBuilder);
    diagnosisRepositoryInTx.save.mockImplementation(async (entity) => ({
      id: 9,
      ...entity,
    }));
    itemWorkflowService.changeTechnicalStatus.mockResolvedValue(order);

    await service.create({
      serviceOrderItemId: item.id,
      summary: 'Nuevo hallazgo',
      outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
    });

    expect(sequenceQueryBuilder.where).toHaveBeenCalledWith(
      'serviceOrderDiagnosis.serviceOrderItemId = :serviceOrderItemId',
      { serviceOrderItemId: item.id },
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'service_order_item_id = :serviceOrderItemId',
      {
        serviceOrderItemId: item.id,
      },
    );
    expect(diagnosisRepositoryInTx.create).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceNumber: 4 }),
    );
  });

  it('deriva la definición comercial solo del item rediagnosticado', async () => {
    const order = createOrder({
      technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
    });
    const item = createItem(order, {
      technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
      commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
    });
    itemRepository.findOne.mockResolvedValue(item);
    orderRepository.findOne.mockResolvedValue(order);
    diagnosisRepositoryInTx.findOne.mockResolvedValue({
      id: 8,
      serviceOrderItemId: item.id,
    });
    diagnosisRepositoryInTx.createQueryBuilder.mockReturnValue(
      createUpdateQueryBuilder(),
    );
    diagnosisRepositoryInTx.save.mockImplementation(async (entity) => ({
      id: 9,
      ...entity,
    }));
    itemWorkflowService.changeTechnicalStatus.mockResolvedValue(order);

    await service.create(
      {
        serviceOrderItemId: item.id,
        sequenceNumber: 2,
        summary: 'Se detectó otra falla',
        outcome: ServiceOrderDiagnosisOutcome.REPAIRABLE,
      },
      { sub: 5, roles: [{ name: 'technician' }] } as any,
    );

    expect(
      commercialVersionService.createRediagnosisDraft,
    ).toHaveBeenCalledWith(
      expect.anything(),
      item.id,
      5,
      'Se detectó otra falla',
    );
  });

  it('rechaza el contrato legacy ambiguo cuando la orden tiene varios equipos', async () => {
    const order = createOrder();
    itemRepository.find.mockResolvedValue([
      createItem(order),
      createItem(order, { id: 102, position: 2, code: `${order.code}-02` }),
    ]);

    await expect(
      service.create({ serviceOrderId: order.id, summary: 'Contrato antiguo' }),
    ).rejects.toThrow('serviceOrderItemId');

    expect(diagnosisRepositoryInTx.save).not.toHaveBeenCalled();
  });

  it('acepta el contrato legacy solo si puede resolver un único equipo', async () => {
    const order = createOrder();
    const item = createItem(order);
    itemRepository.find.mockResolvedValue([item]);
    itemRepository.findOne.mockResolvedValue(item);
    orderRepository.findOne.mockResolvedValue(order);
    diagnosisRepositoryInTx.findOne.mockResolvedValue(null);
    diagnosisRepositoryInTx.createQueryBuilder.mockReturnValue(
      createUpdateQueryBuilder(),
    );
    diagnosisRepositoryInTx.save.mockImplementation(async (entity) => ({
      id: 7,
      ...entity,
    }));
    itemWorkflowService.changeTechnicalStatus.mockResolvedValue(order);

    await service.create({
      serviceOrderId: order.id,
      sequenceNumber: 1,
      summary: 'Único equipo',
    });

    expect(diagnosisRepositoryInTx.create).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderItemId: item.id }),
    );
  });

  it('impide que un técnico diagnostique un item de una orden ajena', async () => {
    const order = createOrder({ assignedToTechnicianId: 5 });
    const item = createItem(order);
    itemRepository.findOne.mockResolvedValue(item);
    orderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.create(
        { serviceOrderItemId: item.id, summary: 'Intento no autorizado' },
        { sub: 9, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza diagnósticos cuando el item no está en una etapa permitida', async () => {
    const order = createOrder();
    const item = createItem(order, {
      technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
    });
    itemRepository.findOne.mockResolvedValue(item);
    orderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.create({
        serviceOrderItemId: item.id,
        summary: 'Fuera de etapa',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(itemWorkflowService.changeTechnicalStatus).not.toHaveBeenCalled();
  });

  it.each([
    [
      ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
    ],
    [
      ServiceOrderDiagnosisOutcome.WARRANTY_REJECTED,
      ServiceOrderTechnicalStatus.GARANTIA_RECHAZADA,
    ],
  ])(
    'resuelve una garantía %s mediante diagnóstico y una transición final válida',
    async (outcome, finalStatus) => {
      const order = createOrder({ serviceType: ServiceType.WARRANTY_SERVICE });
      const item = createItem(order);
      const diagnosis = {
        id: 12,
        serviceOrderItemId: item.id,
        outcome,
        summary: 'Resultado de la revisión de garantía',
      } as ServiceOrderDiagnosis;
      const diagnosedOrder = createOrder({
        serviceType: ServiceType.WARRANTY_SERVICE,
        technicalStatus: ServiceOrderTechnicalStatus.DIAGNOSTICADA,
      });
      const resolvedOrder = createOrder({
        serviceType: ServiceType.WARRANTY_SERVICE,
        technicalStatus: finalStatus,
      });

      itemRepository.findOne.mockResolvedValue(item);
      orderRepository.findOne.mockResolvedValue(order);
      diagnosisRepositoryInTx.findOne.mockResolvedValue(null);
      diagnosisRepositoryInTx.createQueryBuilder.mockReturnValue(
        createUpdateQueryBuilder(),
      );
      diagnosisRepositoryInTx.save.mockResolvedValue(diagnosis);
      itemRepository.save.mockResolvedValue(item);
      itemWorkflowService.changeTechnicalStatus
        .mockResolvedValueOnce(diagnosedOrder)
        .mockResolvedValueOnce(resolvedOrder);

      await expect(
        service.create(
          {
            serviceOrderItemId: item.id,
            sequenceNumber: 1,
            outcome,
            summary: diagnosis.summary,
            details:
              'Se revisó físicamente el equipo y se documentó el resultado.',
          },
          { sub: 5, roles: [{ name: 'technician' }] } as any,
        ),
      ).resolves.toBe(diagnosis);

      expect(warrantiesService.consumeForDiagnosis).toHaveBeenCalledWith(
        expect.anything(),
        order.id,
        diagnosis,
        5,
      );
      expect(itemWorkflowService.changeTechnicalStatus).toHaveBeenNthCalledWith(
        1,
        order.id,
        item.id,
        ServiceOrderTechnicalStatus.DIAGNOSTICADA,
        undefined,
        undefined,
        expect.anything(),
        expect.anything(),
      );
      expect(itemWorkflowService.changeTechnicalStatus).toHaveBeenNthCalledWith(
        2,
        order.id,
        item.id,
        finalStatus,
        undefined,
        diagnosis.summary,
        expect.anything(),
        expect.anything(),
      );
      expect(messageMatrixService.notifyDiagnosisUpdated).toHaveBeenCalledWith(
        resolvedOrder,
        diagnosis,
        null,
      );
    },
  );
});
