import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderAgreementServiceItem } from './entities/service-agreement-service-item.entity';
import { ServiceOrderAgreementSource } from './service-agreement-source.enum';
import { ServiceOrderAgreementStatus } from './service-agreement-status.enum';
import { ServiceOrderAgreementsService } from './service-agreements.service';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  insert: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager?: {
    transaction: jest.Mock;
  };
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  insert: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
});

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 10,
    code: 'SO-010',
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    technicalStatus: ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
    commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
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

const createAgreement = (overrides: Partial<ServiceOrderAgreement> = {}): ServiceOrderAgreement =>
  ({
    id: 5,
    serviceOrderId: 10,
    serviceOrder: createServiceOrder(),
    diagnosis: null,
    diagnosisId: null,
    sequenceNumber: 1,
    status: ServiceOrderAgreementStatus.DRAFT,
    source: undefined as any,
    totalAmount: 120,
    notes: 'Borrador',
    agreedAt: null,
    agreedByUserId: null,
    productItems: [],
    serviceItems: [],
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrderAgreement;

describe('ServiceOrderAgreementsService', () => {
  let service: ServiceOrderAgreementsService;
  let agreementRepository: MockRepo<ServiceOrderAgreement>;
  let agreementProductRepository: MockRepo;
  let agreementServiceItemRepository: MockRepo;
  let serviceOrderRepository: MockRepo<ServiceOrder>;
  let diagnosisRepository: MockRepo;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;

  beforeEach(() => {
    agreementRepository = createMockRepo<ServiceOrderAgreement>();
    agreementProductRepository = createMockRepo();
    agreementServiceItemRepository = createMockRepo();
    serviceOrderRepository = createMockRepo<ServiceOrder>();
    diagnosisRepository = createMockRepo();
    agreementRepository.manager = {
      transaction: jest.fn(),
    };

    workflowService = {
      changeTechnicalStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    messageMatrixService = {
      notifyAgreementConfirmed: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;

    service = new ServiceOrderAgreementsService(
      agreementRepository as any,
      agreementProductRepository as any,
      agreementServiceItemRepository as any,
      serviceOrderRepository as any,
      diagnosisRepository as any,
      workflowService,
      messageMatrixService,
    );
  });

  it('crea acuerdos con un único servicio técnico fijo y monto manual', async () => {
    const serviceOrder = createServiceOrder({ serviceType: ServiceType.STANDARD_SERVICE });
    const savedAgreement = createAgreement({
      status: ServiceOrderAgreementStatus.DRAFT,
      totalAmount: 85,
      source: ServiceOrderAgreementSource.TECHNICIAN_COORDINATION,
    });

    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const savedServiceItems: Array<Record<string, unknown>> = [];
    const agreementRepoInTx = {
      save: jest.fn().mockResolvedValue(savedAgreement),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: '0' }),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
      create: jest.fn((value) => value),
      findOne: jest.fn(),
    };

    const agreementServiceItemRepo = {
      insert: jest.fn().mockImplementation(async (items) => {
        savedServiceItems.push(...items);
      }),
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([]),
    };

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ServiceOrderAgreement) return agreementRepoInTx;
        if (entity === ServiceOrderAgreementServiceItem) return agreementServiceItemRepo;
        return {
          find: jest.fn().mockResolvedValue([]),
          insert: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((value) => value),
        };
      },
    };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) => callback(manager));
    jest.spyOn(service, 'findOne').mockResolvedValue(savedAgreement);

    await service.create({
      serviceOrderId: serviceOrder.id,
      technicalServiceAmount: 85,
      notes: 'Incluye limpieza y pruebas',
    } as any);

    expect(agreementRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 85,
        source: ServiceOrderAgreementSource.TECHNICIAN_COORDINATION,
      }),
    );
    expect(savedServiceItems).toEqual([
      expect.objectContaining({
        serviceId: null,
        serviceCodeSnapshot: 'TECHNICAL_SERVICE',
        serviceNameSnapshot: 'Servicio técnico',
        serviceDescriptionSnapshot: 'Servicio técnico',
        estimatedHours: 1,
        unitPrice: 85,
        lineTotal: 85,
      }),
    ]);
  });

  it('rechaza acuerdos con monto de servicio técnico menor a S/20', async () => {
    const serviceOrder = createServiceOrder({ serviceType: ServiceType.STANDARD_SERVICE });
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);

    await expect(
      service.create({
        serviceOrderId: serviceOrder.id,
        technicalServiceAmount: 19.99,
      } as any),
    ).rejects.toThrow('technicalServiceAmount must be at least 20');
  });

  it('acepta acuerdos sin monto máximo para servicio técnico', async () => {
    const serviceOrder = createServiceOrder({ serviceType: ServiceType.STANDARD_SERVICE });
    const savedAgreement = createAgreement({ totalAmount: 999999.99 });

    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const agreementRepoInTx = {
      save: jest.fn().mockResolvedValue(savedAgreement),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: '0' }),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
      create: jest.fn((value) => value),
      findOne: jest.fn(),
    };

    const persistedServiceItems: Array<Record<string, unknown>> = [];
    const agreementServiceItemRepo = {
      insert: jest.fn().mockImplementation(async (items) => persistedServiceItems.push(...items)),
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([]),
    };

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ServiceOrderAgreement) return agreementRepoInTx;
        if (entity === ServiceOrderAgreementServiceItem) return agreementServiceItemRepo;
        return {
          find: jest.fn().mockResolvedValue([]),
          insert: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((value) => value),
        };
      },
    };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) => callback(manager));
    jest.spyOn(service, 'findOne').mockResolvedValue(savedAgreement);

    const result = await service.create({
      serviceOrderId: serviceOrder.id,
      technicalServiceAmount: 999999.99,
      notes: 'Servicio premium sin tope',
    } as any);

    expect(agreementRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalAmount: 999999.99 }),
    );
    expect(persistedServiceItems).toEqual([
      expect.objectContaining({
        serviceNameSnapshot: 'Servicio técnico',
        unitPrice: 999999.99,
        lineTotal: 999999.99,
      }),
    ]);
    expect(result).toBe(savedAgreement);
  });

  it('recalcula el estado comercial/económico canónico al actualizar un acuerdo draft', async () => {
    const agreement = createAgreement();
    const serviceOrder = createServiceOrder();
    const updatedAgreement = createAgreement({ totalAmount: 150, notes: 'Actualizado' });

    agreementRepository.findOne.mockResolvedValue(agreement);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const agreementServiceItemRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([]),
    };

    const agreementRepoInTx = {
      update: jest.fn().mockResolvedValue(undefined),
    };

      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === ServiceOrderAgreement) return agreementRepoInTx;
          if (entity === ServiceOrderAgreementServiceItem) return agreementServiceItemRepo;
          return agreementServiceItemRepo;
        },
      };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) => callback(manager));
    jest.spyOn(service, 'findOne').mockResolvedValue(updatedAgreement);

    const result = await service.update(agreement.id, {
      technicalServiceAmount: 150,
      notes: 'Actualizado',
    });

    expect(agreementRepoInTx.update).toHaveBeenCalledWith(
      agreement.id,
      expect.objectContaining({ totalAmount: 150, notes: 'Actualizado' }),
    );
    expect(serviceOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE,
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        montoComprometidoVigente: 150,
      }),
    );
    expect(result).toBe(updatedAgreement);
  });

  it('al confirmar un acuerdo deja la orden comercial y técnica en autorizada', async () => {
    const agreement = createAgreement({ status: ServiceOrderAgreementStatus.DRAFT, totalAmount: 230 });
    const serviceOrder = createServiceOrder();
    const confirmedAgreement = createAgreement({ status: ServiceOrderAgreementStatus.CONFIRMED, totalAmount: 230 });

    agreementRepository.findOne.mockResolvedValue(agreement);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          update: jest.fn().mockResolvedValue(undefined),
        })),
      }),
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(confirmedAgreement);

    await service.confirm(agreement.id);

    expect(workflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      agreement.serviceOrderId,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
    );
    expect(serviceOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
        technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        montoComprometidoVigente: 230,
      }),
    );
    expect(messageMatrixService.notifyAgreementConfirmed).toHaveBeenCalledWith(serviceOrder, agreement.id);
  });

  it('al anular un acuerdo recompone el estado canónico usando el acuerdo activo restante', async () => {
    const agreement = createAgreement({
      status: ServiceOrderAgreementStatus.CONFIRMED,
      serviceOrder: createServiceOrder({ serviceType: ServiceType.STANDARD_SERVICE }),
    });
    const serviceOrder = createServiceOrder({
      commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
      serviceType: ServiceType.STANDARD_SERVICE,
    });
    const fallbackAgreement = createAgreement({ status: ServiceOrderAgreementStatus.DRAFT, totalAmount: 80 });

    agreementRepository.findOne
      .mockResolvedValueOnce(agreement)
      .mockResolvedValueOnce(fallbackAgreement);
    agreementRepository.update.mockResolvedValue(undefined);
    agreementRepository.find.mockResolvedValue([]);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    jest.spyOn(service, 'findOne').mockResolvedValue(createAgreement({ status: ServiceOrderAgreementStatus.VOIDED }));

    await service.void(agreement.id, 'Cliente desistió');

    expect(serviceOrderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE,
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        montoComprometidoVigente: 80,
      }),
    );
  });

  it('al anular un acuerdo de diagnóstico genera el cobro automático de servicio técnico una sola vez', async () => {
    const agreement = createAgreement({
      id: 8,
      status: ServiceOrderAgreementStatus.CONFIRMED,
      serviceOrder: createServiceOrder({ serviceType: ServiceType.DIAGNOSIS }),
      serviceOrderId: 10,
    });

    agreementRepository.findOne.mockResolvedValue(agreement);
    agreementRepository.update.mockResolvedValue(undefined);
    serviceOrderRepository.findOne.mockResolvedValue(agreement.serviceOrder);
    agreementRepository.find.mockResolvedValue([]);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    jest.spyOn(service as any, 'createAutomaticTechnicalServiceAgreement').mockResolvedValue(undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue(createAgreement({ status: ServiceOrderAgreementStatus.VOIDED }));

    await service.void(agreement.id, 'Cliente rechazó');

    expect((service as any).createAutomaticTechnicalServiceAgreement).toHaveBeenCalledWith(
      agreement.serviceOrderId,
      'Cliente rechazó',
    );
  });

  it('filtra acuerdos por estado canónico en la consulta de listado', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    agreementRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll({ status: 'DRAFT,CONFIRMED', page: 1, limit: 20 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('agreement.status IN (:...statuses)', {
      statuses: [ServiceOrderAgreementStatus.DRAFT, ServiceOrderAgreementStatus.CONFIRMED],
    });
  });
});
