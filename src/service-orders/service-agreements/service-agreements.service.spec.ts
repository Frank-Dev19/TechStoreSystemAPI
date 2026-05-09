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
import { Product } from '../../inventory/entities/product.entity';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderAgreementProduct } from './entities/service-agreement-product.entity';
import { ServiceOrderAgreementServiceItem } from './entities/service-agreement-service-item.entity';
import { ServiceOrderAgreementLineProvenance } from './service-agreement-line-provenance.enum';
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

const createAgreementProduct = (overrides: Partial<ServiceOrderAgreementProduct> = {}): ServiceOrderAgreementProduct =>
  ({
    id: 31,
    serviceOrderAgreementId: 5,
    product: null,
    productId: 7,
    productCodeSnapshot: 'P-7',
    productNameSnapshot: 'Placa lógica',
    productDescriptionSnapshot: 'Repuesto original',
    quantity: 1,
    unitPrice: 40,
    lineTotal: 40,
    requiresPurchase: false,
    notes: null,
    provenance: ServiceOrderAgreementLineProvenance.NEW,
    derivedFromAgreementProductItemId: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrderAgreementProduct;

const createAgreementServiceItem = (
  overrides: Partial<ServiceOrderAgreementServiceItem> = {},
): ServiceOrderAgreementServiceItem =>
  ({
    id: 41,
    serviceOrderAgreementId: 5,
    serviceId: null,
    serviceCodeSnapshot: 'TECHNICAL_SERVICE',
    serviceNameSnapshot: 'Servicio técnico',
    serviceDescriptionSnapshot: 'Servicio técnico',
    estimatedHours: 1,
    unitPrice: 80,
    lineTotal: 80,
    notes: null,
    provenance: ServiceOrderAgreementLineProvenance.NEW,
    derivedFromAgreementServiceItemId: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrderAgreementServiceItem;

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

  it('crea un draft derivado desde el último acuerdo confirmado activo', async () => {
    const serviceOrder = createServiceOrder({
      serviceType: ServiceType.DIAGNOSIS,
      technicalStatus: ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
    });
    const inheritedProduct = createAgreementProduct({
      id: 71,
      serviceOrderAgreementId: 44,
      provenance: ServiceOrderAgreementLineProvenance.NEW,
      lineTotal: 40,
    });
    const inheritedService = createAgreementServiceItem({
      id: 81,
      serviceOrderAgreementId: 44,
      provenance: ServiceOrderAgreementLineProvenance.NEW,
      unitPrice: 80,
      lineTotal: 80,
    });
    const baseAgreement = createAgreement({
      id: 44,
      status: ServiceOrderAgreementStatus.CONFIRMED,
      sequenceNumber: 3,
      notes: 'Acuerdo vigente',
      productItems: [inheritedProduct],
      serviceItems: [inheritedService],
    });
    const savedAgreement = createAgreement({
      id: 55,
      status: ServiceOrderAgreementStatus.DRAFT,
      sequenceNumber: 4,
      totalAmount: 120,
      notes: 'Acuerdo vigente',
      derivedFromAgreementId: 44,
    });

    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    diagnosisRepository.findOne.mockResolvedValue({ id: 91, serviceOrderId: 10, sequenceNumber: 2 } as any);
    agreementRepository.findOne.mockResolvedValue(baseAgreement);

    const insertedProducts: Array<Record<string, unknown>> = [];
    const insertedServices: Array<Record<string, unknown>> = [];
    const agreementRepoInTx = {
      save: jest.fn().mockResolvedValue(savedAgreement),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: '3' }),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(baseAgreement),
    };
    const agreementProductRepoInTx = {
      insert: jest.fn().mockImplementation(async (items) => insertedProducts.push(...items)),
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([]),
    };
    const agreementServiceItemRepoInTx = {
      insert: jest.fn().mockImplementation(async (items) => insertedServices.push(...items)),
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([]),
    };
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ServiceOrderAgreement) return agreementRepoInTx;
        if (entity === ServiceOrderAgreementProduct) return agreementProductRepoInTx;
        if (entity === ServiceOrderAgreementServiceItem) return agreementServiceItemRepoInTx;
        return {
          find: jest.fn().mockResolvedValue([]),
          insert: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((value) => value),
        };
      },
    };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) => callback(manager));
    jest.spyOn(service, 'findOne').mockResolvedValue(savedAgreement as any);

    await service.create({
      serviceOrderId: serviceOrder.id,
      diagnosisId: 91,
      baseAgreementId: 44,
    } as any);

    expect(agreementRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({
        derivedFromAgreementId: 44,
        totalAmount: 120,
        notes: 'Acuerdo vigente',
      }),
    );
    expect(insertedProducts).toEqual([
      expect.objectContaining({
        provenance: ServiceOrderAgreementLineProvenance.INHERITED,
        derivedFromAgreementProductItemId: 71,
        lineTotal: 40,
      }),
    ]);
    expect(insertedServices).toEqual([
      expect.objectContaining({
        provenance: ServiceOrderAgreementLineProvenance.INHERITED,
        derivedFromAgreementServiceItemId: 81,
        unitPrice: 80,
        lineTotal: 80,
      }),
    ]);
  });

  it('deriva siempre desde el último acuerdo confirmado activo cuando existe historial reemplazado', async () => {
    const serviceOrder = createServiceOrder({
      serviceType: ServiceType.DIAGNOSIS,
      technicalStatus: ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
    });
    const latestActiveAgreement = createAgreement({
      id: 144,
      status: ServiceOrderAgreementStatus.CONFIRMED,
      sequenceNumber: 4,
      notes: 'Versión vigente',
      productItems: [createAgreementProduct({ id: 171, serviceOrderAgreementId: 144, lineTotal: 90 })],
      serviceItems: [createAgreementServiceItem({ id: 181, serviceOrderAgreementId: 144, unitPrice: 70, lineTotal: 70 })],
    });
    const savedAgreement = createAgreement({
      id: 155,
      status: ServiceOrderAgreementStatus.DRAFT,
      sequenceNumber: 5,
      totalAmount: 160,
      derivedFromAgreementId: 144,
    });

    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    diagnosisRepository.findOne.mockResolvedValue({ id: 191, serviceOrderId: 10, sequenceNumber: 3 } as any);
    agreementRepository.findOne
      .mockResolvedValueOnce(latestActiveAgreement)
      .mockResolvedValueOnce(latestActiveAgreement);

    const insertedProducts: Array<Record<string, unknown>> = [];
    const insertedServices: Array<Record<string, unknown>> = [];
    const agreementRepoInTx = {
      save: jest.fn().mockResolvedValue(savedAgreement),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: '4' }),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
      create: jest.fn((value) => value),
    };
    const agreementProductRepoInTx = {
      insert: jest.fn().mockImplementation(async (items) => insertedProducts.push(...items)),
      create: jest.fn((value) => value),
    };
    const agreementServiceItemRepoInTx = {
      insert: jest.fn().mockImplementation(async (items) => insertedServices.push(...items)),
      create: jest.fn((value) => value),
    };
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ServiceOrderAgreement) return agreementRepoInTx;
        if (entity === ServiceOrderAgreementProduct) return agreementProductRepoInTx;
        if (entity === ServiceOrderAgreementServiceItem) return agreementServiceItemRepoInTx;
        return { insert: jest.fn().mockResolvedValue(undefined), create: jest.fn((value) => value) };
      },
    };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) => callback(manager));
    jest.spyOn(service, 'findOne').mockResolvedValue(savedAgreement as any);

    await service.create({ serviceOrderId: serviceOrder.id, diagnosisId: 191, baseAgreementId: 144 } as any);

    expect(agreementRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { serviceOrderId: serviceOrder.id, status: ServiceOrderAgreementStatus.CONFIRMED },
        order: { sequenceNumber: 'DESC', agreedAt: 'DESC', createdAt: 'DESC' },
      }),
    );
    expect(agreementRepoInTx.save).toHaveBeenCalledWith(expect.objectContaining({ derivedFromAgreementId: 144, sequenceNumber: 5 }));
    expect(insertedProducts[0]).toEqual(expect.objectContaining({ derivedFromAgreementProductItemId: 171, provenance: ServiceOrderAgreementLineProvenance.INHERITED }));
    expect(insertedServices[0]).toEqual(expect.objectContaining({ derivedFromAgreementServiceItemId: 181, provenance: ServiceOrderAgreementLineProvenance.INHERITED }));
  });

  it('rechaza derivar un acuerdo fuera de un rediagnóstico', async () => {
    const serviceOrder = createServiceOrder({ serviceType: ServiceType.DIAGNOSIS });
    const baseAgreement = createAgreement({ id: 44, status: ServiceOrderAgreementStatus.CONFIRMED });

    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    diagnosisRepository.findOne.mockResolvedValue({ id: 91, serviceOrderId: 10, sequenceNumber: 1 } as any);
    agreementRepository.findOne.mockResolvedValue(baseAgreement);

    await expect(
      service.create({
        serviceOrderId: serviceOrder.id,
        diagnosisId: 91,
        baseAgreementId: 44,
        technicalServiceAmount: 80,
      } as any),
    ).rejects.toThrow('Derived agreements are only allowed for rediagnosis flows');
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

  it('rechaza editar o eliminar líneas heredadas que no sean servicio técnico', async () => {
    const agreement = createAgreement({
      derivedFromAgreementId: 44,
      productItems: [
        createAgreementProduct({
          provenance: ServiceOrderAgreementLineProvenance.INHERITED,
          derivedFromAgreementProductItemId: 71,
        }),
      ],
      serviceItems: [
        createAgreementServiceItem({
          provenance: ServiceOrderAgreementLineProvenance.INHERITED,
          derivedFromAgreementServiceItemId: 81,
        }),
      ],
    });

    agreementRepository.findOne.mockResolvedValue(agreement);

    await expect(
      service.update(agreement.id, {
        products: [{ productId: 55, quantity: 1, unitPrice: 10 }],
      } as any),
    ).rejects.toThrow('Inherited lines cannot be edited or removed');

    expect(agreementRepository.manager?.transaction).not.toHaveBeenCalled();
    expect(agreement.productItems?.[0]).toEqual(
      expect.objectContaining({
        productId: 7,
        provenance: ServiceOrderAgreementLineProvenance.INHERITED,
        derivedFromAgreementProductItemId: 71,
      }),
    );
  });

  it('permite cambiar solo el monto técnico heredado y agregar líneas nuevas', async () => {
    const serviceOrder = createServiceOrder();
    const inheritedProduct = createAgreementProduct({
      provenance: ServiceOrderAgreementLineProvenance.INHERITED,
      derivedFromAgreementProductItemId: 71,
      lineTotal: 40,
    });
    const inheritedTechnicalService = createAgreementServiceItem({
      id: 81,
      provenance: ServiceOrderAgreementLineProvenance.INHERITED,
      derivedFromAgreementServiceItemId: 91,
      unitPrice: 80,
      lineTotal: 80,
    });
    const agreement = createAgreement({
      derivedFromAgreementId: 44,
      serviceOrder,
      productItems: [inheritedProduct],
      serviceItems: [inheritedTechnicalService],
    });
    const updatedAgreement = createAgreement({ totalAmount: 180, notes: 'Nuevo texto de versión' });

    agreementRepository.findOne.mockResolvedValue(agreement);
    serviceOrderRepository.findOne.mockResolvedValue(serviceOrder);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);

    const insertedProducts: Array<Record<string, unknown>> = [];
    const serviceItemUpdate = jest.fn().mockResolvedValue(undefined);
    const agreementRepoInTx = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const agreementProductRepoInTx = {
      insert: jest.fn().mockImplementation(async (items) => insertedProducts.push(...items)),
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([inheritedProduct]),
    };
    const agreementServiceItemRepoInTx = {
      update: serviceItemUpdate,
      create: jest.fn((value) => value),
      find: jest.fn().mockResolvedValue([inheritedTechnicalService]),
    };
    const inventoryProductRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 501,
          code: 'P-501',
          name: 'Bisagra',
          description: 'Repuesto nuevo',
          salePrice: 30,
        },
      ]),
    };
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ServiceOrderAgreement) return agreementRepoInTx;
        if (entity === ServiceOrderAgreementProduct) return agreementProductRepoInTx;
        if (entity === ServiceOrderAgreementServiceItem) return agreementServiceItemRepoInTx;
        if (entity === Product) return inventoryProductRepo;
        return {
          find: jest.fn().mockResolvedValue([]),
          insert: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((value) => value),
        };
      },
    };

    agreementRepository.manager?.transaction.mockImplementation(async (callback) => callback(manager));
    jest.spyOn(service, 'findOne').mockResolvedValue(updatedAgreement);

    const result = await service.update(agreement.id, {
      notes: 'Nuevo texto de versión',
      technicalServiceAmount: 80,
      newProducts: [{ productId: 501, quantity: 2, unitPrice: 30 }],
    } as any);

    expect(serviceItemUpdate).toHaveBeenCalledWith(
      81,
      expect.objectContaining({ unitPrice: 80, lineTotal: 80 }),
    );
    expect(insertedProducts).toEqual([
      expect.objectContaining({
        provenance: ServiceOrderAgreementLineProvenance.NEW,
        derivedFromAgreementProductItemId: null,
        productId: 501,
        lineTotal: 60,
      }),
    ]);
    expect(agreementRepoInTx.update).toHaveBeenCalledWith(
      agreement.id,
      expect.objectContaining({ totalAmount: 180, notes: 'Nuevo texto de versión' }),
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

    expect(queryBuilder.set).toHaveBeenCalledWith({ status: ServiceOrderAgreementStatus.SUPERSEDED });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('id <> :id', { id: agreement.id });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('status IN (:...statuses)', {
      statuses: [ServiceOrderAgreementStatus.DRAFT, ServiceOrderAgreementStatus.CONFIRMED],
    });

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

  it('calcula rankings usando solo la versión confirmada vigente de cada orden', async () => {
    const previousAgreement = createAgreement({
      id: 201,
      serviceOrderId: 77,
      status: ServiceOrderAgreementStatus.SUPERSEDED,
      sequenceNumber: 1,
      totalAmount: 999,
      serviceOrder: createServiceOrder({
        id: 77,
        assignedToTechnicianId: 15,
        serviceType: ServiceType.DIAGNOSIS,
      }),
      productItems: [createAgreementProduct({ lineTotal: 999 })],
      serviceItems: [],
    });
    const currentAgreement = createAgreement({
      id: 202,
      serviceOrderId: 77,
      status: ServiceOrderAgreementStatus.CONFIRMED,
      sequenceNumber: 2,
      totalAmount: 150,
      serviceOrder: createServiceOrder({
        id: 77,
        assignedToTechnicianId: 15,
        serviceType: ServiceType.DIAGNOSIS,
      }),
      productItems: [createAgreementProduct({ lineTotal: 40 })],
      serviceItems: [createAgreementServiceItem({ lineTotal: 110 })],
    });

    agreementRepository.find.mockResolvedValue([previousAgreement, currentAgreement]);

    const result = await service.getTechnicianRevenueRankings();

    expect(result.technicians).toEqual([
      expect.objectContaining({
        technicianId: 15,
        itemsCount: 1,
        totalRevenue: 150,
        productRevenue: 40,
        serviceRevenue: 110,
        diagnosisRevenue: 150,
      }),
    ]);
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

  it('serializa metadata de herencia y permisos por línea', async () => {
    const agreement = createAgreement({
      derivedFromAgreementId: 44,
      productItems: [
        createAgreementProduct({
          provenance: ServiceOrderAgreementLineProvenance.INHERITED,
          derivedFromAgreementProductItemId: 71,
        }),
        createAgreementProduct({ id: 72, provenance: ServiceOrderAgreementLineProvenance.NEW }),
      ],
      serviceItems: [
        createAgreementServiceItem({
          id: 81,
          provenance: ServiceOrderAgreementLineProvenance.INHERITED,
          derivedFromAgreementServiceItemId: 91,
          serviceCodeSnapshot: 'TECHNICAL_SERVICE',
        }),
      ],
    });

    agreementRepository.findOne.mockResolvedValue(agreement);

    const result = await service.findOne(agreement.id);

    expect(result).toEqual(
      expect.objectContaining({
        derivedFromAgreementId: 44,
        productItems: [
          expect.objectContaining({
            provenance: ServiceOrderAgreementLineProvenance.INHERITED,
            derivedFromItemId: 71,
            isInherited: true,
            canEdit: false,
            canDelete: false,
          }),
          expect.objectContaining({
            provenance: ServiceOrderAgreementLineProvenance.NEW,
            isInherited: false,
            canEdit: true,
            canDelete: true,
          }),
        ],
        serviceItems: [
          expect.objectContaining({
            provenance: ServiceOrderAgreementLineProvenance.INHERITED,
            derivedFromItemId: 91,
            isInherited: true,
            canEdit: true,
            canDelete: false,
          }),
        ],
      }),
    );
  });
});
