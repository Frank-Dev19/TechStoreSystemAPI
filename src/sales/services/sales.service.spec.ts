import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Client } from 'src/clients/entities/client.entity';
import { SaleItemKindDto } from '../dto/create-sale.dto';
import { DocumentType } from '../enums/document-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { SaleType } from '../enums/sale-type.enum';
import { SalesService } from './sales.service';
import { ServiceOrder } from 'src/service-orders/entities/service-order.entity';
import { ServiceOrderSaleLink } from 'src/service-orders/entities/service-order-sale-link.entity';
import { ServiceOrderAgreement } from 'src/service-orders/service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from 'src/service-orders/service-agreements/service-agreement-status.enum';
import { ServiceOrderEconomicStatus } from 'src/service-orders/enums';
import { ClientKind } from 'src/clients/entities/client-kind.enum';

type MockRepo = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('SalesService', () => {
  let service: SalesService;
  let dataSource: jest.Mocked<DataSource>;
  let saleRepo: MockRepo;
  let saleItemRepo: MockRepo;
  let salePaymentRepo: MockRepo;
  let saleLineDiscountRepo: MockRepo;
  let saleComboItemRepo: MockRepo;
  let clientRepo: MockRepo;
  let productRepo: MockRepo;
  let lotRepo: MockRepo;
  let serialRepo: MockRepo;
  let stockRepo: MockRepo;
  let cashRegisterRepo: MockRepo;
  let transactionRepo: MockRepo;
  let movementRepo: MockRepo;
  let movementSerialRepo: MockRepo;
  let serviceOrderRepo: MockRepo;
  let agreementRepo: MockRepo;
  let serviceOrderSaleLinkRepo: MockRepo;
  let salesPricing: any;
  let salesInventory: any;
  let cashFlowService: any;
  let documentSeriesService: any;
  let pricingEngine: any;
  let taxConfigService: any;

  beforeEach(() => {
    dataSource = { createQueryRunner: jest.fn() } as unknown as jest.Mocked<DataSource>;
    saleRepo = createMockRepo();
    saleItemRepo = createMockRepo();
    salePaymentRepo = createMockRepo();
    saleLineDiscountRepo = createMockRepo();
    saleComboItemRepo = createMockRepo();
    clientRepo = createMockRepo();
    productRepo = createMockRepo();
    lotRepo = createMockRepo();
    serialRepo = createMockRepo();
    stockRepo = createMockRepo();
    cashRegisterRepo = createMockRepo();
    transactionRepo = createMockRepo();
    movementRepo = createMockRepo();
    movementSerialRepo = createMockRepo();
    serviceOrderRepo = createMockRepo();
    agreementRepo = createMockRepo();
    serviceOrderSaleLinkRepo = createMockRepo();

    salesPricing = { getProductPricing: jest.fn() };
    salesInventory = { validateStock: jest.fn() };
    cashFlowService = {};
    documentSeriesService = {
      getNextNumber: jest.fn(),
      getActiveByType: jest.fn(),
    };
    pricingEngine = { calculatePrice: jest.fn() };
    taxConfigService = {};

    service = new SalesService(
      dataSource,
      saleRepo as any,
      saleItemRepo as any,
      salePaymentRepo as any,
      saleLineDiscountRepo as any,
      saleComboItemRepo as any,
      clientRepo as any,
      productRepo as any,
      lotRepo as any,
      serialRepo as any,
      stockRepo as any,
      cashRegisterRepo as any,
      transactionRepo as any,
      movementRepo as any,
      movementSerialRepo as any,
      serviceOrderRepo as any,
      agreementRepo as any,
      serviceOrderSaleLinkRepo as any,
      salesPricing,
      salesInventory,
      cashFlowService,
      documentSeriesService,
      pricingEngine,
      taxConfigService,
    );
  });

  it('rechaza ventas manuales con líneas de servicio', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 99 } as Client);
    documentSeriesService.getNextNumber.mockResolvedValue({ series: 'B001', number: '000001' });
    documentSeriesService.getActiveByType.mockResolvedValue({ id: 1 });

    await expect(
      service.create(
        {
          companyId: 1,
          customerId: 99,
          saleType: SaleType.PRODUCT,
          documentType: DocumentType.BOLETA,
          issueDate: '2026-04-21',
          items: [{ itemType: SaleItemKindDto.SERVICE, quantity: 1, finalUnitPrice: 50 }],
          payments: [{ method: PaymentMethod.CASH, amount: 50 }],
        } as any,
        'tester',
      ),
    ).rejects.toThrow('Las ventas manuales solo admiten productos');
  });

  it('crea ventas desde orden usando el último acuerdo confirmado y autoliga el comprobante', async () => {
    const order = {
      id: 7,
      clientId: 25,
      economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
    } as ServiceOrder;
    const agreement = {
      id: 44,
      serviceOrderId: 7,
      status: ServiceOrderAgreementStatus.CONFIRMED,
      totalAmount: 120,
      productItems: [],
      serviceItems: [
        {
          serviceCodeSnapshot: 'TECHNICAL_SERVICE',
          serviceNameSnapshot: 'Servicio técnico',
          unitPrice: 120,
          lineTotal: 120,
          notes: null,
        },
      ],
    } as unknown as ServiceOrderAgreement;

    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn().mockImplementation(async (entity) => {
          if (entity === ServiceOrderSaleLink) return null;
          return {
            id: 3,
            companyId: 1,
            status: 'OPEN',
            currentBalance: 0,
            expectedBalance: 0,
            totalCash: 0,
            totalCard: 0,
            totalTransfer: 0,
            totalYape: 0,
            totalPlin: 0,
          };
        }),
        save: jest.fn().mockImplementation(async (entity) => {
          if ((entity as any).saleType) return { ...entity, id: 501 };
          return entity;
        }),
      },
    };

    serviceOrderRepo.findOne.mockResolvedValue(order);
    agreementRepo.find.mockResolvedValue([agreement]);
    dataSource.createQueryRunner.mockReturnValue(queryRunner as any);
    documentSeriesService.getNextNumber.mockResolvedValue({ series: 'B001', number: '000321' });
    documentSeriesService.getActiveByType.mockResolvedValue({ id: 9 });
    salesInventory.registerSaleMovement = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 501, total: 120 } as any);

    const result = await service.createFromServiceOrder(
      {
        serviceOrderId: 7,
        companyId: 1,
        documentType: DocumentType.BOLETA,
        issueDate: '2026-04-21',
        payments: [{ method: PaymentMethod.CASH, amount: 120 }],
      } as any,
      'tester',
    );

    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 25,
        saleType: SaleType.SERVICE,
        total: 120,
      }),
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: 7,
        agreementId: 44,
        saleId: 501,
        linkedAmount: 120,
      }),
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        cashRegisterId: 3,
        saleId: 501,
        type: 'SALE_PAYMENT',
        subtype: PaymentMethod.CASH,
        recordedBy: 'tester',
      }),
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      ServiceOrder,
      expect.objectContaining({
        id: 7,
        economicStatus: ServiceOrderEconomicStatus.TOTAL,
        montoReconciliado: 120,
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 501, total: 120 }));
  });

  it('revierte la transacción si la orden ya tiene vínculo para el acuerdo vigente', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn().mockImplementation(async (entity) => {
          if (entity === ServiceOrderSaleLink) return { id: 1 };
          return {
            id: 3,
            companyId: 1,
            status: 'OPEN',
            currentBalance: 0,
            expectedBalance: 0,
            totalCash: 0,
            totalCard: 0,
            totalTransfer: 0,
            totalYape: 0,
            totalPlin: 0,
          };
        }),
        save: jest.fn().mockImplementation(async (entity) => {
          if ((entity as any).saleType) return { ...entity, id: 999 };
          return entity;
        }),
      },
    };

    dataSource.createQueryRunner.mockReturnValue(queryRunner as any);
    documentSeriesService.getNextNumber.mockResolvedValue({ series: 'B001', number: '000322' });
    documentSeriesService.getActiveByType.mockResolvedValue({ id: 9 });
    serviceOrderRepo.findOne.mockResolvedValue({
      id: 7,
      clientId: 25,
      economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
    } as any);
    agreementRepo.find.mockResolvedValue([
      {
        id: 44,
        serviceOrderId: 7,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        totalAmount: 120,
        productItems: [],
        serviceItems: [{ serviceCodeSnapshot: 'TECHNICAL_SERVICE', serviceNameSnapshot: 'Servicio técnico', unitPrice: 120 }],
      } as any,
    ]);
    await expect(
      service.createFromServiceOrder(
        {
          serviceOrderId: 7,
          companyId: 1,
          documentType: DocumentType.BOLETA,
          issueDate: '2026-04-21',
          payments: [{ method: PaymentMethod.CASH, amount: 120 }],
        } as any,
        'tester',
      ),
    ).rejects.toThrow('La orden ya tiene un comprobante autoligado para el acuerdo vigente');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('crea una venta agrupada desde múltiples órdenes del mismo cliente con snapshot fiscal', async () => {
    const serviceOrders = [
      { id: 7, code: 'SO-001', clientId: 25, economicStatus: ServiceOrderEconomicStatus.PENDIENTE, montoComprometidoVigente: 120 } as any,
      { id: 8, code: 'SO-002', clientId: 25, economicStatus: ServiceOrderEconomicStatus.PENDIENTE, montoComprometidoVigente: 80 } as any,
    ];
    const agreements = [
      {
        id: 44,
        serviceOrderId: 7,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        totalAmount: 120,
        productItems: [],
        serviceItems: [{ serviceCodeSnapshot: 'TECHNICAL_SERVICE', serviceNameSnapshot: 'Servicio técnico', unitPrice: 120 }],
      } as any,
      {
        id: 45,
        serviceOrderId: 8,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        totalAmount: 80,
        productItems: [],
        serviceItems: [{ serviceCodeSnapshot: 'TECHNICAL_SERVICE', serviceNameSnapshot: 'Servicio técnico', unitPrice: 80 }],
      } as any,
    ];
    const taxpayer = {
      id: 99,
      kind: ClientKind.COMPANY,
      name: 'Universidad Nacional de Trujillo',
      tradeName: 'UNT',
      documentNumber: '20172557628',
      address: 'Av. Juan Pablo II',
      email: 'facturacion@unt.pe',
      documentType: { name: 'RUC' },
    } as any;
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 3,
          companyId: 1,
          status: 'OPEN',
          currentBalance: 0,
          expectedBalance: 0,
          totalCash: 0,
          totalCard: 0,
          totalTransfer: 0,
          totalYape: 0,
          totalPlin: 0,
        }),
        save: jest.fn().mockImplementation(async (entity) => {
          if ((entity as any).saleType) return { ...entity, id: 700 };
          return entity;
        }),
      },
    };

    serviceOrderRepo.find.mockResolvedValue(serviceOrders);
    agreementRepo.find.mockResolvedValue(agreements);
    clientRepo.findOne.mockResolvedValue(taxpayer);
    serviceOrderSaleLinkRepo.findOne.mockResolvedValue(null);
    dataSource.createQueryRunner.mockReturnValue(queryRunner as any);
    documentSeriesService.getNextNumber.mockResolvedValue({ series: 'F001', number: '000111' });
    documentSeriesService.getActiveByType.mockResolvedValue({ id: 9 });
    salesInventory.registerSaleMovement = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 700, total: 200 } as any);

    const result = await service.createFromServiceAgreements(
      {
        serviceOrderIds: [7, 8],
        companyId: 1,
        taxpayerCustomerId: 99,
        documentType: DocumentType.FACTURA,
        issueDate: '2026-05-01',
        payments: [{ method: PaymentMethod.CASH, amount: 200 }],
      } as any,
      'tester',
    );

    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 99,
        billingSnapshotName: 'Universidad Nacional de Trujillo',
        billingSnapshotTradeName: 'UNT',
        billingSnapshotDocumentNumber: '20172557628',
        total: 200,
      }),
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderId: 7, agreementId: 44, linkedAmount: 120, saleId: 700 }),
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderId: 8, agreementId: 45, linkedAmount: 80, saleId: 700 }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 700, total: 200 }));
  });

  it('rechaza venta agrupada cuando intenta facturar órdenes de clientes distintos', async () => {
    serviceOrderRepo.find.mockResolvedValue([
      { id: 7, code: 'SO-001', clientId: 25, economicStatus: ServiceOrderEconomicStatus.PENDIENTE } as any,
      { id: 8, code: 'SO-002', clientId: 30, economicStatus: ServiceOrderEconomicStatus.PENDIENTE } as any,
    ]);

    await expect(
      service.createFromServiceAgreements(
        {
          serviceOrderIds: [7, 8],
          companyId: 1,
          taxpayerCustomerId: 99,
          documentType: DocumentType.BOLETA,
          issueDate: '2026-05-01',
          payments: [{ method: PaymentMethod.CASH, amount: 200 }],
        } as any,
        'tester',
      ),
    ).rejects.toThrow('Solo se pueden agrupar órdenes del mismo cliente operativo');
  });
});
