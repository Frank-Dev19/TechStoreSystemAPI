import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ServiceOrderController } from '../src/service-orders/controllers/service-order.controller';
import { ServiceOrderInboxController } from '../src/service-orders/inbox/service-order-inbox.controller';
import { ServiceOrderService } from '../src/service-orders/services/service-order.service';
import { ServiceOrderWorkflowService } from '../src/service-orders/services/service-order-workflow.service';
import { ServiceOrderSaleLinkService } from '../src/service-orders/services/service-order-sale-link.service';
import { ServiceOrderInboxService } from '../src/service-orders/inbox/service-order-inbox.service';
import { ServiceOrderInboxChannelService } from '../src/service-orders/inbox/service-order-inbox-channel.service';
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

describe('ServiceOrders critical endpoints (e2e)', () => {
  let app: INestApplication;
  let serviceOrderService: jest.Mocked<ServiceOrderService>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let saleLinkService: jest.Mocked<ServiceOrderSaleLinkService>;
  let inboxService: jest.Mocked<ServiceOrderInboxService>;
  let channelService: jest.Mocked<ServiceOrderInboxChannelService>;

  beforeAll(async () => {
    serviceOrderService = {
      markAsDelivered: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      bulkSoftDelete: jest.fn(),
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderService>;

    workflowService = {
      changeTechnicalStatus: jest.fn(),
      assignTechnician: jest.fn(),
      getAssignmentSuggestion: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    saleLinkService = {
      searchSales: jest.fn(),
      getLinksByServiceOrderIds: jest.fn(),
      linkSaleToServiceOrders: jest.fn(),
      unlink: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderSaleLinkService>;

    inboxService = {
      buildViewerContext: jest.fn((user) => ({ userId: user.sub, displayName: user.name, role: 'ADMIN' })),
      listThreads: jest.fn(),
      getMessages: jest.fn(),
      markThreadAsRead: jest.fn(),
      sendMessage: jest.fn(),
      downloadAttachment: jest.fn(),
      receiveInboundMessage: jest.fn(),
      updateDeliveryStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;

    channelService = {
      verifyWebhookChallenge: jest.fn(),
      assertWebhookSignature: jest.fn(),
      normalizeWebhookPayload: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;

    const moduleBuilder = Test.createTestingModule({
      controllers: [ServiceOrderController, ServiceOrderInboxController],
      providers: [
        { provide: ServiceOrderService, useValue: serviceOrderService },
        { provide: ServiceOrderWorkflowService, useValue: workflowService },
        { provide: ServiceOrderSaleLinkService, useValue: saleLinkService },
        { provide: ServiceOrderInboxService, useValue: inboxService },
        { provide: ServiceOrderInboxChannelService, useValue: channelService },
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

  it('PATCH /service-orders/:id/deliver propaga actor autenticado', async () => {
    serviceOrderService.markAsDelivered.mockResolvedValue({ id: 7, operativeStatus: 'ENTREGADA' } as any);

    await request(app.getHttpServer()).patch('/service-orders/7/deliver').expect(200);

    expect(serviceOrderService.markAsDelivered).toHaveBeenCalledWith(7, 123);
  });

  it('PATCH /service-orders/:id/technical/:status propaga reason y actor', async () => {
    workflowService.changeTechnicalStatus.mockResolvedValue({ id: 7, technicalStatus: 'EN_DIAGNOSTICO' } as any);

    await request(app.getHttpServer())
      .patch('/service-orders/7/technical/EN_DIAGNOSTICO')
      .send({ reason: 'Equipo ingresó a revisión' })
      .expect(200);

    expect(workflowService.changeTechnicalStatus).toHaveBeenCalledWith(7, 'EN_DIAGNOSTICO', 123, 'Equipo ingresó a revisión');
  });

  it('POST /service-orders/inbox/threads/:id/messages acepta multipart y delega archivos', async () => {
    inboxService.sendMessage.mockResolvedValue({ id: 15, partialFailures: [] } as any);

    await request(app.getHttpServer())
      .post('/service-orders/inbox/threads/9/messages')
      .field('text', 'hola cliente')
      .attach('attachments', Buffer.from('fake-image'), 'foto.jpg')
      .expect(201);

    expect(inboxService.sendMessage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ text: 'hola cliente' }),
      expect.arrayContaining([
        expect.objectContaining({ originalname: 'foto.jpg' }),
      ]),
      expect.objectContaining({ userId: 123, role: 'ADMIN' }),
    );
  });

  it('POST /service-orders/inbox/webhook procesa mensajes y estados normalizados', async () => {
    channelService.normalizeWebhookPayload.mockReturnValue({
      messages: [{ externalMessageId: 'wamid-1' }],
      statuses: [{ externalMessageId: 'wamid-1', status: 'delivered' }],
    } as any);

    await request(app.getHttpServer())
      .post('/service-orders/inbox/webhook')
      .set('x-hub-signature-256', 'sha256=test-signature')
      .send({ entry: [] })
      .expect(201)
      .expect({ ok: true, receivedMessages: 1, receivedStatuses: 1 });

    expect(channelService.assertWebhookSignature).toHaveBeenCalled();
    expect(inboxService.receiveInboundMessage).toHaveBeenCalledWith({ externalMessageId: 'wamid-1' });
    expect(inboxService.updateDeliveryStatus).toHaveBeenCalledWith({ externalMessageId: 'wamid-1', status: 'delivered' });
  });
});
