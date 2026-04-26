import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SalesController } from '../src/sales/controllers/sales.controller';
import { SalesService } from '../src/sales/services/sales.service';
import { ServiceOrderController } from '../src/service-orders/controllers/service-order.controller';
import { ServiceOrderAgreementsController } from '../src/service-orders/service-agreements/service-agreements.controller';
import { ServiceOrderService } from '../src/service-orders/services/service-order.service';
import { ServiceOrderWorkflowService } from '../src/service-orders/services/service-order-workflow.service';
import { ServiceOrderSaleLinkService } from '../src/service-orders/services/service-order-sale-link.service';
import { ServiceOrderAgreementsService } from '../src/service-orders/service-agreements/service-agreements.service';
import { JwtAccessGuard } from '../src/auth/guards/jwt-access.guard';
import { RolesGuard } from '../src/rbac/guards/roles.guard';
import { PermissionsGuard } from '../src/rbac/guards/permissions.guard';

class AuthenticatedGuardStub implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      sub: 123,
      id: 123,
      name: 'Tester',
      roles: [{ name: 'admin', permissions: [{ code: 'all' }] }],
    };
    return true;
  }
}

class AllowGuardStub implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('Commercial service-order flow (e2e)', () => {
  let app: INestApplication;
  let salesService: jest.Mocked<SalesService>;
  let agreementService: jest.Mocked<ServiceOrderAgreementsService>;
  let serviceOrderService: jest.Mocked<ServiceOrderService>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let saleLinkService: jest.Mocked<ServiceOrderSaleLinkService>;

  beforeAll(async () => {
    salesService = {
      createFromServiceOrder: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      simulate: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      getMetrics: jest.fn(),
      getIncomeTaxReport: jest.fn(),
      getSalesByProduct: jest.fn(),
    } as unknown as jest.Mocked<SalesService>;

    agreementService = {
      create: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      confirm: jest.fn(),
      void: jest.fn(),
      createDiagnosisFeeAgreement: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      bulkSoftDelete: jest.fn(),
      bulkRestore: jest.fn(),
      getTechnicianRevenueRankings: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderAgreementsService>;

    serviceOrderService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      markAsDelivered: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      bulkSoftDelete: jest.fn(),
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderService>;

    workflowService = {
      getAssignmentSuggestion: jest.fn(),
      assignTechnician: jest.fn(),
      changeTechnicalStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    saleLinkService = {
      searchSales: jest.fn(),
      getLinksByServiceOrderIds: jest.fn(),
      linkSaleToServiceOrders: jest.fn(),
      unlink: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderSaleLinkService>;

    const moduleBuilder = Test.createTestingModule({
      controllers: [SalesController, ServiceOrderController, ServiceOrderAgreementsController],
      providers: [
        { provide: SalesService, useValue: salesService },
        { provide: ServiceOrderAgreementsService, useValue: agreementService },
        { provide: ServiceOrderService, useValue: serviceOrderService },
        { provide: ServiceOrderWorkflowService, useValue: workflowService },
        { provide: ServiceOrderSaleLinkService, useValue: saleLinkService },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue(new AuthenticatedGuardStub())
      .overrideGuard(RolesGuard)
      .useValue(new AllowGuardStub())
      .overrideGuard(PermissionsGuard)
      .useValue(new AllowGuardStub());

    const moduleRef = await moduleBuilder.compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /service-order-agreements crea un acuerdo con technicalServiceAmount y concepto fijo', async () => {
    agreementService.create.mockResolvedValue({
      id: 41,
      serviceOrderId: 9,
      totalAmount: 65,
      serviceItems: [
        {
          serviceCodeSnapshot: 'TECHNICAL_SERVICE',
          serviceNameSnapshot: 'Servicio técnico',
          unitPrice: 65,
        },
      ],
    } as any);

    await request(app.getHttpServer())
      .post('/service-order-agreements')
      .send({
        serviceOrderId: 9,
        notes: 'Servicio base',
        technicalServiceAmount: 65,
        products: [],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.totalAmount).toBe(65);
        expect(body.serviceItems[0].serviceNameSnapshot).toBe('Servicio técnico');
      });

    expect(agreementService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: 9,
        technicalServiceAmount: 65,
      }),
    );
  });

  it('POST /sales/from-service-order emite venta desde orden y usa el actor autenticado', async () => {
    salesService.createFromServiceOrder.mockResolvedValue({
      id: 501,
      total: 65,
      series: 'B001',
      number: '000501',
    } as any);

    await request(app.getHttpServer())
      .post('/sales/from-service-order')
      .send({
        serviceOrderId: 9,
        companyId: 1,
        documentType: 'BOLETA',
        issueDate: '2026-04-22',
        payments: [{ method: 'CASH', amount: 65 }],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(501);
        expect(body.total).toBe(65);
      });

    expect(salesService.createFromServiceOrder).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderId: 9 }),
      'Tester',
    );
  });

  it('POST /service-orders/backoffice/billing-links mantiene el flujo excepcional de backoffice', async () => {
    saleLinkService.linkSaleToServiceOrders.mockResolvedValue([
      {
        id: 99,
        saleId: 700,
        serviceOrderId: 9,
        agreementId: 41,
        linkedAmount: 65,
      },
    ] as any);

    await request(app.getHttpServer())
      .post('/service-orders/backoffice/billing-links')
      .send({ saleId: 700, serviceOrderIds: [9] })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].linkedAmount).toBe(65);
      });

    expect(saleLinkService.linkSaleToServiceOrders).toHaveBeenCalledWith(
      { saleId: 700, serviceOrderIds: [9] },
      '123',
    );
  });
});
