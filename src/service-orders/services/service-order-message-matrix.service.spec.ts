import { ServiceOrderCommercialStatus, ServiceOrderEconomicStatus, ServiceOrderOperativeStatus, ServiceOrderPriority, ServiceOrderTechnicalStatus, ServiceType, RequestOrigin, EquipmentType } from '../enums';
import { NotificationMessage } from '../entities/notification-message.entity';
import { NotificationDeliveryAttempt } from '../entities/notification-delivery-attempt.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderInboxChannelService } from '../inbox/service-order-inbox-channel.service';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderWhatsAppTemplateService } from './service-order-whatsapp-template.service';

type MockRepo = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
};

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => ({ id: 1, ...value })),
  create: jest.fn((value) => value),
});

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 201,
    code: 'SO-001',
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
    priority: ServiceOrderPriority.MEDIUM,
    requestOrigin: RequestOrigin.CLIENT,
    equipmentType: EquipmentType.LAPTOP,
    serviceType: ServiceType.DIAGNOSIS,
    initialIssue: 'No enciende',
    clientId: 1,
    clientSnapshotName: 'Juan Pérez',
    clientSnapshotPhone: '+51932998578',
    createdBy: 5,
    createdAt: new Date('2026-05-18T12:00:00.000Z'),
    updatedAt: new Date('2026-05-18T12:00:00.000Z'),
    receivedAt: new Date('2026-05-18T12:00:00.000Z'),
    montoComprometidoVigente: 0,
    montoReconciliado: 0,
    ...overrides,
  }) as ServiceOrder;

describe('ServiceOrderMessageMatrixService', () => {
  it('usa template para acuerdo confirmado aunque la ventana de 24h esté abierta', async () => {
    const notificationRepository = createMockRepo();
    const attemptRepository = createMockRepo();
    const inboxService = {
      hasCustomerServiceWindow: jest.fn().mockResolvedValue(true),
      getThreadForServiceOrder: jest.fn().mockResolvedValue({
        clientPhone: '+51932998578',
        contextToken: 'ctx-201',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = {
      dispatchTemplateMessage: jest.fn().mockResolvedValue({
        status: 'SENT',
        externalMessageId: 'wamid.1',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = {
      buildAuthorizationConfirmedTemplate: jest.fn().mockReturnValue({
        templateName: 'autorizacion_confirmada_inicio_servicio',
        languageCode: 'es',
        bodyParameters: ['Juan Pérez', 'SO-001', 'Laptop'],
      }),
    } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;

    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any,
      attemptRepository as any,
      inboxService,
      inboxChannelService,
      whatsappTemplateService,
    );

    await service.notifyAgreementConfirmed(createServiceOrder(), 9001);

    expect(inboxService.hasCustomerServiceWindow).not.toHaveBeenCalled();
    expect(inboxChannelService.dispatchTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'autorizacion_confirmada_inicio_servicio',
        bodyParameters: ['Juan Pérez', 'SO-001', 'Laptop'],
      }),
    );
  });

  it('usa template para acuerdo confirmado cuando la ventana de 24h está cerrada', async () => {
    const notificationRepository = createMockRepo();
    const attemptRepository = createMockRepo();
    const inboxService = {
      hasCustomerServiceWindow: jest.fn().mockResolvedValue(false),
      getThreadForServiceOrder: jest.fn().mockResolvedValue({
        clientPhone: '+51932998578',
        contextToken: 'ctx-201',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = {
      dispatchTemplateMessage: jest.fn().mockResolvedValue({
        status: 'SENT',
        externalMessageId: 'wamid.2',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = {
      buildAuthorizationConfirmedTemplate: jest.fn().mockReturnValue({
        templateName: 'autorizacion_confirmada_inicio_servicio',
        languageCode: 'es',
        bodyParameters: ['Juan Pérez', 'SO-001', 'Laptop'],
      }),
    } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;

    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any,
      attemptRepository as any,
      inboxService,
      inboxChannelService,
      whatsappTemplateService,
    );

    await service.notifyAgreementConfirmed(createServiceOrder(), 9002);

    expect(inboxChannelService.dispatchTemplateMessage).toHaveBeenCalled();
  });

  it('omite la encuesta automática cuando no existe una plantilla configurada', async () => {
    const notificationRepository = createMockRepo();
    const attemptRepository = createMockRepo();
    const inboxService = {
      getThreadForServiceOrder: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = {
      dispatchTemplateMessage: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = {
      buildSurveyRequestTemplate: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;

    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any,
      attemptRepository as any,
      inboxService,
      inboxChannelService,
      whatsappTemplateService,
    );

    await service.notifySurveyRequest(createServiceOrder());

    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(inboxChannelService.dispatchTemplateMessage).not.toHaveBeenCalled();
  });

  it('stores batch metadata for intake notification', async () => {
    const notificationRepository = createMockRepo();
    const attemptRepository = createMockRepo();
    const inboxService = {
      hasThreadActivity: jest.fn(),
      getThreadForServiceOrder: jest.fn().mockResolvedValue({
        clientPhone: '+51932998578',
        contextToken: 'ctx-201',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = {
      dispatchTemplateMessage: jest.fn().mockResolvedValue({
        status: 'SENT',
        externalMessageId: 'wamid.1',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = {
      buildOrderIntakeTemplate: jest.fn().mockReturnValue({
        templateName: 'ordenes_ingresadas_asignadas',
        languageCode: 'es',
        documentUrl: 'https://stsperu.online/api/service-orders/temp-documents/abc',
        documentFileName: 'resumen-ordenes.pdf',
        bodyParameters: ['Juan Pérez', 'tus órdenes de servicio'],
        quickReplyPayloads: ['ENTENDIDO', 'CONSULTA'],
      }),
    } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;

    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any,
      attemptRepository as any,
      inboxService,
      inboxChannelService,
      whatsappTemplateService,
    );

    await service.dispatchOrderIntakeTemplate({
      serviceOrders: [createServiceOrder({ id: 201 }), createServiceOrder({ id: 202, code: 'SO-002' })],
      documentUrl: 'https://stsperu.online/api/service-orders/temp-documents/abc',
      documentFileName: 'resumen-ordenes.pdf',
      tempDocumentToken: 'abc',
    });

    expect(notificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        body: null,
        scope: 'ORDER_BATCH',
        metadataJson: expect.stringContaining('"orderIds":[201,202]'),
      }),
    );
  });
});
