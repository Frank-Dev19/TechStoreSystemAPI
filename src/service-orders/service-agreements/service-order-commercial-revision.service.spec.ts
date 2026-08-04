import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { PricingConfigService } from '../../pricing/services/pricing-config.service';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  EquipmentType,
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderAggregateProjectionService } from '../services/service-order-aggregate-projection.service';
import { ServiceOrderAgreementItem } from './entities/service-agreement-item.entity';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderLineDiscount } from './entities/service-order-line-discount.entity';
import { ServiceOrderCommercialLineType } from './service-order-commercial-line-type.enum';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';
import { ServiceOrderCommercialRevisionService } from './service-order-commercial-revision.service';

const createRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  createQueryBuilder: jest.fn(),
});

const updateQueryBuilder = () => ({
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

const sequenceQueryBuilder = (max: string) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue({ max }),
});

const createOrder = (): ServiceOrder =>
  ({
    id: 70,
    code: 'SO-03-08-2026-0007',
    assignedToTechnicianId: 9,
    serviceType: ServiceType.DIAGNOSIS,
  }) as ServiceOrder;

const createItem = (
  order: ServiceOrder,
  id: number,
  position: number,
): ServiceOrderItem =>
  ({
    id,
    serviceOrderId: order.id,
    serviceOrder: order,
    position,
    code: `${order.code}-${String(position).padStart(2, '0')}`,
    equipmentType: EquipmentType.LAPTOP,
    equipmentTypeOther: null,
    brand: 'Lenovo',
    model: `T${position}`,
    serialNumber: `SER-${position}`,
    serialNumberNormalized: `SER-${position}`,
    accessories: null,
    initialIssue: 'No enciende',
    notes: null,
    priority: ServiceOrderPriority.LOW,
    operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    technicalStatus: ServiceOrderTechnicalStatus.DIAGNOSTICADA,
    commercialStatus: ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA,
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
  }) as ServiceOrderItem;

describe('ServiceOrderCommercialRevisionService', () => {
  let service: ServiceOrderCommercialRevisionService;
  let manager: jest.Mocked<EntityManager>;
  let orderRepo: ReturnType<typeof createRepo>;
  let itemRepo: ReturnType<typeof createRepo>;
  let versionRepo: ReturnType<typeof createRepo>;
  let lineRepo: ReturnType<typeof createRepo>;
  let agreementRepo: ReturnType<typeof createRepo>;
  let agreementItemRepo: ReturnType<typeof createRepo>;
  let productRepo: ReturnType<typeof createRepo>;
  let discountRepo: ReturnType<typeof createRepo>;
  let projection: jest.Mocked<ServiceOrderAggregateProjectionService>;
  let pricingConfig: jest.Mocked<PricingConfigService>;

  beforeEach(() => {
    orderRepo = createRepo();
    itemRepo = createRepo();
    versionRepo = createRepo();
    lineRepo = createRepo();
    agreementRepo = createRepo();
    agreementItemRepo = createRepo();
    productRepo = createRepo();
    discountRepo = createRepo();
    manager = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrder) return orderRepo;
        if (entity === ServiceOrderItem) return itemRepo;
        if (entity === ServiceOrderItemCommercialVersion) return versionRepo;
        if (entity === ServiceOrderItemCommercialLine) return lineRepo;
        if (entity === ServiceOrderAgreement) return agreementRepo;
        if (entity === ServiceOrderAgreementItem) return agreementItemRepo;
        if (entity === Product) return productRepo;
        if (entity === ServiceOrderLineDiscount) return discountRepo;
        throw new Error(`Repositorio inesperado: ${entity?.name}`);
      }),
    } as unknown as jest.Mocked<EntityManager>;
    projection = {
      recalculateLocked: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderAggregateProjectionService>;
    pricingConfig = {
      resolveForProduct: jest.fn(),
      resolveGlobal: jest.fn(),
    } as unknown as jest.Mocked<PricingConfigService>;
    service = new ServiceOrderCommercialRevisionService(
      manager,
      projection,
      pricingConfig,
    );
  });

  it('crea una revisión global reutilizando la versión aceptada del hermano sin cambios', async () => {
    const order = createOrder();
    const itemOne = createItem(order, 701, 1);
    const itemTwo = createItem(order, 702, 2);
    const acceptedOne = {
      id: 801,
      serviceOrderItemId: itemOne.id,
      versionNumber: 1,
      status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
      totalAmount: 80,
    };
    const acceptedTwo = {
      id: 802,
      serviceOrderItemId: itemTwo.id,
      versionNumber: 2,
      status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
      totalAmount: 100,
    };
    const draftTwo = {
      id: 803,
      serviceOrderItemId: itemTwo.id,
      derivedFromVersionId: acceptedTwo.id,
      versionNumber: 3,
      status: ServiceOrderItemCommercialVersionStatus.DRAFT,
      totalAmount: 120,
    };

    orderRepo.findOne.mockResolvedValue(order);
    itemRepo.find.mockResolvedValue([itemOne, itemTwo]);
    versionRepo.findOne.mockImplementation(async ({ where }) =>
      Number(where.serviceOrderItemId) === itemOne.id
        ? acceptedOne
        : acceptedTwo,
    );
    versionRepo.createQueryBuilder.mockReturnValue(sequenceQueryBuilder('2'));
    versionRepo.save.mockResolvedValue(draftTwo);
    agreementRepo.findOne.mockResolvedValue({ id: 900, status: 'CONFIRMED' });
    agreementRepo.createQueryBuilder.mockReturnValue(updateQueryBuilder());
    agreementRepo.save.mockResolvedValue({
      id: 901,
      serviceOrderId: order.id,
      totalAmount: 200,
    });
    projection.recalculateLocked.mockResolvedValue(order);

    const result = await service.createRevision(
      {
        serviceOrderId: order.id,
        notes: 'Revisión parcial',
        items: [
          {
            serviceOrderItemId: itemTwo.id,
            baseVersionId: acceptedTwo.id,
            notes: 'Cambio solicitado para el segundo equipo',
            lines: [
              {
                type: ServiceOrderCommercialLineType.SERVICE,
                serviceId: 1,
                quantity: 1,
                unitPrice: 120,
              },
            ],
          },
        ],
      },
      { sub: 9, roles: [{ name: 'technician' }] } as any,
    );

    expect(versionRepo.save).toHaveBeenCalledTimes(1);
    expect(versionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderItemId: itemTwo.id,
        derivedFromVersionId: acceptedTwo.id,
        versionNumber: 3,
        totalAmount: 120,
      }),
    );
    expect(agreementItemRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        serviceOrderItemId: itemOne.id,
        commercialVersionId: acceptedOne.id,
      }),
      expect.objectContaining({
        serviceOrderItemId: itemTwo.id,
        commercialVersionId: draftTwo.id,
      }),
    ]);
    expect(agreementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: order.id,
        derivedFromAgreementId: 900,
        totalAmount: 200,
      }),
    );
    expect(projection.recalculateLocked).toHaveBeenCalledWith(
      manager,
      order.id,
    );
    expect(result.items).toHaveLength(2);
  });

  it('reemplaza el borrador previo del equipo cuando el cliente solicita un nuevo cambio', async () => {
    const order = createOrder();
    const item = createItem(order, 701, 1);
    const previousDraft = {
      id: 802,
      serviceOrderItemId: item.id,
      derivedFromVersionId: 801,
      versionNumber: 2,
      status: ServiceOrderItemCommercialVersionStatus.DRAFT,
      totalAmount: 90,
      lines: [],
    } as unknown as ServiceOrderItemCommercialVersion;

    orderRepo.findOne.mockResolvedValue(order);
    itemRepo.find.mockResolvedValue([item]);
    versionRepo.findOne.mockResolvedValue(previousDraft);
    versionRepo.createQueryBuilder.mockReturnValue(sequenceQueryBuilder('2'));
    versionRepo.save.mockImplementation(async (value) =>
      value.id ? value : { ...value, id: 803 },
    );
    agreementRepo.findOne.mockResolvedValue({
      id: 900,
      sequenceNumber: 2,
      status: 'DRAFT',
    });
    agreementRepo.createQueryBuilder.mockReturnValue(updateQueryBuilder());
    agreementRepo.save.mockResolvedValue({
      id: 901,
      serviceOrderId: order.id,
      totalAmount: 110,
    });
    projection.recalculateLocked.mockResolvedValue(order);

    await service.createRevision({
      serviceOrderId: order.id,
      items: [
        {
          serviceOrderItemId: item.id,
          baseVersionId: previousDraft.id,
          lines: [
            {
              type: ServiceOrderCommercialLineType.SERVICE,
              quantity: 1,
              unitPrice: 110,
            },
          ],
        },
      ],
    });

    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: previousDraft.id,
        status: ServiceOrderItemCommercialVersionStatus.REPLACED,
      }),
    );
    expect(versionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderItemId: item.id,
        derivedFromVersionId: previousDraft.id,
        versionNumber: 3,
      }),
    );
  });

  it('rechaza una revisión si un equipo activo sin cambios todavía no tiene versión comercial', async () => {
    const order = createOrder();
    const itemOne = createItem(order, 701, 1);
    const itemTwo = createItem(order, 702, 2);
    orderRepo.findOne.mockResolvedValue(order);
    itemRepo.find.mockResolvedValue([itemOne, itemTwo]);
    versionRepo.findOne.mockImplementation(async ({ where }) =>
      Number(where.serviceOrderItemId) === itemOne.id
        ? null
        : { id: 802, serviceOrderItemId: itemTwo.id },
    );

    await expect(
      service.createRevision({
        serviceOrderId: order.id,
        items: [
          {
            serviceOrderItemId: itemTwo.id,
            lines: [
              {
                type: ServiceOrderCommercialLineType.SERVICE,
                quantity: 1,
                unitPrice: 120,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow('equipo activo');

    expect(agreementRepo.save).not.toHaveBeenCalled();
  });

  it('rechaza items repetidos para impedir dos versiones nuevas del mismo equipo en una revisión', async () => {
    const order = createOrder();
    orderRepo.findOne.mockResolvedValue(order);

    await expect(
      service.createRevision({
        serviceOrderId: order.id,
        items: [
          {
            serviceOrderItemId: 701,
            lines: [
              {
                type: ServiceOrderCommercialLineType.SERVICE,
                quantity: 1,
                unitPrice: 80,
              },
            ],
          },
          {
            serviceOrderItemId: 701,
            lines: [
              {
                type: ServiceOrderCommercialLineType.SERVICE,
                quantity: 1,
                unitPrice: 90,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('impide que un técnico edite una orden asignada a otro técnico', async () => {
    const order = createOrder();
    orderRepo.findOne.mockResolvedValue(order);

    await expect(
      service.createRevision(
        {
          serviceOrderId: order.id,
          items: [
            {
              serviceOrderItemId: 701,
              lines: [
                {
                  type: ServiceOrderCommercialLineType.SERVICE,
                  quantity: 1,
                  unitPrice: 80,
                },
              ],
            },
          ],
        },
        { sub: 99, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('persiste el descuento permitido como snapshot y calcula el total neto de la línea', async () => {
    const order = createOrder();
    const item = createItem(order, 701, 1);
    const product = {
      id: 41,
      sku: 'SSD-1TB',
      name: 'SSD 1 TB',
      description: null,
    } as Product;
    orderRepo.findOne.mockResolvedValue(order);
    itemRepo.find.mockResolvedValue([item]);
    productRepo.find.mockResolvedValue([product]);
    versionRepo.findOne.mockResolvedValue(null);
    versionRepo.createQueryBuilder.mockReturnValue(sequenceQueryBuilder('0'));
    versionRepo.save.mockImplementation(async (value) => ({
      ...value,
      id: 801,
    }));
    agreementRepo.findOne.mockResolvedValue(null);
    agreementRepo.createQueryBuilder.mockReturnValue(updateQueryBuilder());
    agreementRepo.save.mockResolvedValue({
      id: 901,
      serviceOrderId: order.id,
      totalAmount: 190,
    });
    pricingConfig.resolveForProduct.mockResolvedValue({
      config: { id: 44, maxDiscountPct: 7 } as any,
      scope: 'product',
    });
    projection.recalculateLocked.mockResolvedValue(order);

    await service.createRevision(
      {
        serviceOrderId: order.id,
        items: [
          {
            serviceOrderItemId: item.id,
            lines: [
              {
                type: ServiceOrderCommercialLineType.PRODUCT,
                productId: product.id,
                quantity: 2,
                unitPrice: 100,
                discountPct: 5,
              },
            ],
          },
        ],
      },
      {
        sub: 9,
        roles: [
          {
            name: 'technician',
            permissions: [{ code: 'service-order-agreement.apply-discount' }],
          },
        ],
      } as any,
    );

    expect(lineRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        grossAmount: 200,
        discountAmount: 10,
        netAmount: 190,
      }),
    );
    expect(discountRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        pricingConfigId: 44,
        percentage: 5,
        amount: 10,
        maxAllowedPct: 7,
        appliedByUserId: 9,
        wasLimitOverridden: false,
      }),
    ]);
  });

  it('rechaza un descuento superior al máximo sin permiso de override', async () => {
    const order = createOrder();
    const item = createItem(order, 701, 1);
    const product = {
      id: 41,
      sku: 'SSD-1TB',
      name: 'SSD 1 TB',
      description: null,
    } as Product;
    orderRepo.findOne.mockResolvedValue(order);
    itemRepo.find.mockResolvedValue([item]);
    productRepo.find.mockResolvedValue([product]);
    versionRepo.findOne.mockResolvedValue(null);
    pricingConfig.resolveForProduct.mockResolvedValue({
      config: { id: 44, maxDiscountPct: 7 } as any,
      scope: 'product',
    });

    await expect(
      service.createRevision(
        {
          serviceOrderId: order.id,
          items: [
            {
              serviceOrderItemId: item.id,
              lines: [
                {
                  type: ServiceOrderCommercialLineType.PRODUCT,
                  productId: product.id,
                  quantity: 1,
                  unitPrice: 100,
                  discountPct: 12,
                },
              ],
            },
          ],
        },
        {
          sub: 9,
          roles: [
            {
              name: 'technician',
              permissions: [{ code: 'service-order-agreement.apply-discount' }],
            },
          ],
        } as any,
      ),
    ).rejects.toThrow('autorización de supervisión');

    expect(versionRepo.save).not.toHaveBeenCalled();
    expect(discountRepo.save).not.toHaveBeenCalled();
  });

  it('permite el override supervisado con motivo y conserva el máximo original en el snapshot', async () => {
    const order = createOrder();
    const item = createItem(order, 701, 1);
    orderRepo.findOne.mockResolvedValue(order);
    itemRepo.find.mockResolvedValue([item]);
    versionRepo.findOne.mockResolvedValue(null);
    versionRepo.createQueryBuilder.mockReturnValue(sequenceQueryBuilder('0'));
    versionRepo.save.mockImplementation(async (value) => ({
      ...value,
      id: 801,
    }));
    agreementRepo.findOne.mockResolvedValue(null);
    agreementRepo.createQueryBuilder.mockReturnValue(updateQueryBuilder());
    agreementRepo.save.mockResolvedValue({
      id: 901,
      serviceOrderId: order.id,
      totalAmount: 88,
    });
    pricingConfig.resolveGlobal.mockResolvedValue({
      id: 5,
      maxDiscountPct: 7,
    } as any);
    projection.recalculateLocked.mockResolvedValue(order);

    await service.createRevision(
      {
        serviceOrderId: order.id,
        items: [
          {
            serviceOrderItemId: item.id,
            lines: [
              {
                type: ServiceOrderCommercialLineType.SERVICE,
                quantity: 1,
                unitPrice: 100,
                discountPct: 12,
                discountOverrideReason:
                  'Atención comercial autorizada por supervisión.',
              },
            ],
          },
        ],
      },
      {
        sub: 3,
        roles: [
          {
            name: 'supervisor',
            permissions: [
              { code: 'service-order-agreement.apply-discount' },
              { code: 'service-order-agreement.override-discount-limit' },
            ],
          },
        ],
      } as any,
    );

    expect(discountRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        pricingConfigId: 5,
        percentage: 12,
        amount: 12,
        maxAllowedPct: 7,
        appliedByUserId: 3,
        authorizedByUserId: 3,
        wasLimitOverridden: true,
        overrideReason: 'Atención comercial autorizada por supervisión.',
      }),
    ]);
  });
});
