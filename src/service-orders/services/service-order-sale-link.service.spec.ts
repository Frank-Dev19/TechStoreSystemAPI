import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Sale } from '../../sales/entities/sale.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderSaleLink } from '../entities/service-order-sale-link.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { ServiceOrderEconomicStatus } from '../enums';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderSaleLinkService } from './service-order-sale-link.service';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
});

describe('ServiceOrderSaleLinkService', () => {
  let service: ServiceOrderSaleLinkService;
  let linkRepository: MockRepo<ServiceOrderSaleLink>;
  let saleRepository: MockRepo<Sale>;
  let serviceOrderRepository: MockRepo<ServiceOrder>;
  let agreementRepository: MockRepo<ServiceOrderAgreement>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;

  beforeEach(() => {
    linkRepository = createMockRepo<ServiceOrderSaleLink>();
    saleRepository = createMockRepo<Sale>();
    serviceOrderRepository = createMockRepo<ServiceOrder>();
    agreementRepository = createMockRepo<ServiceOrderAgreement>();
    messageMatrixService = {
      notifyInvoiceLinked: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;

    service = new ServiceOrderSaleLinkService(
      linkRepository as any,
      saleRepository as any,
      serviceOrderRepository as any,
      agreementRepository as any,
      messageMatrixService,
    );
  });

  it('rechaza billing-links manuales para órdenes que no están pendientes de pago', async () => {
    saleRepository.findOne.mockResolvedValue({
      id: 12,
      customerId: 5,
      total: 120,
      status: 'CONFIRMED',
      deletedAt: null,
    } as any);
    serviceOrderRepository.find.mockResolvedValue([
      {
        id: 8,
        code: 'SO-008',
        clientId: 5,
        economicStatus: ServiceOrderEconomicStatus.TOTAL,
      } as any,
    ]);
    agreementRepository.find.mockResolvedValue([
      {
        id: 20,
        serviceOrderId: 8,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        totalAmount: 120,
        productItems: [],
        serviceItems: [],
      } as any,
    ]);

    await expect(
      service.linkSaleToServiceOrders({ saleId: 12, serviceOrderIds: [8] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('liga manualmente una orden pendiente de pago como flujo de excepción/backoffice', async () => {
    const sale = {
      id: 12,
      customerId: 5,
      total: 120,
      status: 'CONFIRMED',
      deletedAt: null,
    } as any;
    const order = {
      id: 8,
      code: 'SO-008',
      clientId: 5,
      economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
      montoComprometidoVigente: 120,
      montoReconciliado: 0,
    } as any;

    saleRepository.findOne.mockResolvedValue(sale);
    serviceOrderRepository.find.mockResolvedValue([order]);
    agreementRepository.find.mockResolvedValue([
      {
        id: 20,
        serviceOrderId: 8,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        totalAmount: 120,
        productItems: [],
        serviceItems: [],
      } as any,
    ]);
    linkRepository.findOne.mockResolvedValue(null);
    linkRepository.save.mockImplementation(async (value) => value);
    linkRepository.find.mockResolvedValue([
      {
        id: 99,
        saleId: 12,
        serviceOrderId: 8,
        agreementId: 20,
        linkedAmount: 120,
        deletedAt: null,
      } as any,
    ]);
    agreementRepository.findOne.mockResolvedValue({
      id: 20,
      serviceOrderId: 8,
      totalAmount: 120,
    } as any);
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockImplementation(async (value) => value);

    const result = await service.linkSaleToServiceOrders({ saleId: 12, serviceOrderIds: [8] }, 'backoffice');

    expect(linkRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        saleId: 12,
        serviceOrderId: 8,
        agreementId: 20,
        linkedBy: 'backoffice',
      }),
    );
    expect(messageMatrixService.notifyInvoiceLinked).toHaveBeenCalledWith(order, sale);
    expect(result).toHaveLength(1);
  });
});
