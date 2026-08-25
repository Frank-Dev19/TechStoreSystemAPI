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
  it('omite la plantilla heredada de autorización confirmada', async () => {
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
    expect(inboxChannelService.dispatchTemplateMessage).not.toHaveBeenCalled();
  });

  it('omite la plantilla heredada de autorización aunque la ventana esté cerrada', async () => {
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

    expect(inboxChannelService.dispatchTemplateMessage).not.toHaveBeenCalled();
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

  it('stores intake metadata and uses the single three-variable contract', async () => {
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
        templateName: 'resumen_de_orden_de_servicio',
        languageCode: 'es_PE',
        documentUrl: 'https://stsperu.online/api/service-orders/temp-documents/abc',
        documentFileName: 'resumen-ordenes.pdf',
        bodyParameters: ['Juan Pérez', 'SO-001', '2 equipos'],
        quickReplyPayloads: ['CONSULTA'],
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
      equipmentCount: '2 equipos',
      documentUrl: 'https://stsperu.online/api/service-orders/temp-documents/abc',
      documentFileName: 'resumen-ordenes.pdf',
      tempDocumentToken: 'abc',
    });

    expect(whatsappTemplateService.buildOrderIntakeTemplate).toHaveBeenCalledWith({
      clientName: 'Juan Pérez',
      orderCode: 'SO-001',
      equipmentCount: '2 equipos',
      documentUrl: 'https://stsperu.online/api/service-orders/temp-documents/abc',
      documentFileName: 'resumen-ordenes.pdf',
      quickReplyPayloads: ['CONSULTA'],
    });

    expect(notificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        body: null,
        scope: 'ORDER_BATCH',
        metadataJson: expect.stringContaining('"orderIds":[201,202]'),
      }),
    );
  });

  it('envía un resumen de cancelación consolidado con documento e idempotencia por solicitudes', async () => {
    const notificationRepository = createMockRepo();
    notificationRepository.findOne.mockResolvedValue(null);
    const attemptRepository = createMockRepo();
    const inboxService = { getThreadForServiceOrder: jest.fn().mockResolvedValue({ clientPhone: '+51932998578', contextToken: 'ctx-201' }) } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = { dispatchTemplateMessage: jest.fn().mockResolvedValue({ status: 'SENT', externalMessageId: 'wamid.cancel' }) } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = { buildCancellationSummaryTemplate: jest.fn().mockReturnValue({ templateName: 'resumen_cancelacion_equipos', languageCode: 'es_PE', bodyParameters: ['Juan Pérez', '2', 'SO-001'], quickReplyPayloads: ['CONSULTA'], documentUrl: 'https://api.example.com/doc', documentFileName: 'cancelacion.pdf' }) } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;
    const service = new ServiceOrderMessageMatrixService(notificationRepository as any, attemptRepository as any, inboxService, inboxChannelService, whatsappTemplateService);

    await service.dispatchCancellationSummaryTemplate({
      serviceOrder: createServiceOrder(),
      cancellationRequestIds: [502, 501],
      itemCount: 2,
      documentUrl: 'https://api.example.com/doc',
      documentFileName: 'cancelacion.pdf',
      tempDocumentToken: 'token',
    });

    expect(notificationRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'service_order:201:cancellation:501-502',
      messageType: 'cancellation.summary',
      metadataJson: expect.stringContaining('"cancellationRequestIds":[501,502]'),
    }));
    expect(inboxChannelService.dispatchTemplateMessage).toHaveBeenCalledWith(expect.objectContaining({
      documentUrl: 'https://api.example.com/doc',
      documentFileName: 'cancelacion.pdf',
      bodyParameters: ['Juan Pérez', '2', 'SO-001'],
    }));
  });

  it('envía una recotización con documento y acciones ligadas a la versión', async () => {
    const notificationRepository = createMockRepo();
    notificationRepository.findOne.mockResolvedValue(null);
    const attemptRepository = createMockRepo();
    const inboxService = {
      getThreadForServiceOrder: jest.fn().mockResolvedValue({
        clientPhone: '+51932998578',
        contextToken: 'ctx-201',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = {
      dispatchTemplateMessage: jest.fn().mockResolvedValue({
        status: 'SENT',
        externalMessageId: 'wamid.rediagnosis',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = {
      buildRediagnosisAgreementTemplate: jest.fn().mockReturnValue({
        templateName: 'rediagnostico_recotizacion_equipo',
        languageCode: 'es_PE',
        bodyParameters: ['Juan Pérez', 'Laptop Lenovo', 'SO-001', '280.00'],
        quickReplyPayloads: ['ACEPTAR_COTIZACION:42', 'CONSULTA'],
        documentUrl: 'https://api.example.com/recotizacion.pdf',
        documentFileName: 'recotizacion.pdf',
      }),
    } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;
    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any,
      attemptRepository as any,
      inboxService,
      inboxChannelService,
      whatsappTemplateService,
    );

    await service.dispatchDiagnosisQuoteTemplate({
      serviceOrder: createServiceOrder(),
      commercialVersionId: 42,
      equipmentLabel: 'Laptop Lenovo',
      totalAmount: 280,
      documentUrl: 'https://api.example.com/recotizacion.pdf',
      documentFileName: 'recotizacion.pdf',
      tempDocumentToken: 'token-42',
      isRediagnosis: true,
    });

    expect(whatsappTemplateService.buildRediagnosisAgreementTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentUrl: 'https://api.example.com/recotizacion.pdf',
        quickReplyPayloads: ['ACEPTAR_COTIZACION:42', 'CONSULTA'],
      }),
    );
    expect(notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'commercial_version:42:rediagnosis-quote-template',
        messageType: 'rediagnosis.quote.issued',
      }),
    );
  });

  it('reintenta una cotización cuya entrega anterior quedó programada para reintento', async () => {
    const notificationRepository = createMockRepo();
    notificationRepository.findOne.mockResolvedValue({
      id: 15,
      serviceOrderId: 201,
      idempotencyKey: 'commercial_version:42:diagnosis-quote-template',
      status: 'RETRY_SCHEDULED',
      attemptCount: 1,
      nextAttemptAt: new Date(),
      lastError: 'Meta temporalmente no disponible',
    });
    const attemptRepository = createMockRepo();
    const inboxService = {
      getThreadForServiceOrder: jest.fn().mockResolvedValue({
        clientPhone: '+51932998578',
        contextToken: 'ctx-201',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;
    const inboxChannelService = {
      dispatchTemplateMessage: jest.fn().mockResolvedValue({
        status: 'SENT',
        externalMessageId: 'wamid.retry',
      }),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;
    const whatsappTemplateService = {
      buildDiagnosisAgreementAvailableTemplate: jest.fn().mockReturnValue({
        templateName: 'diagnostico_cotizacion_equipo',
        languageCode: 'es_PE',
        bodyParameters: ['Juan Pérez', 'Laptop Lenovo', 'SO-001', '280.00'],
        quickReplyPayloads: ['ACEPTAR_COTIZACION:42', 'CONSULTA'],
        documentUrl: 'https://api.example.com/cotizacion.pdf',
        documentFileName: 'cotizacion.pdf',
      }),
    } as unknown as jest.Mocked<ServiceOrderWhatsAppTemplateService>;
    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any,
      attemptRepository as any,
      inboxService,
      inboxChannelService,
      whatsappTemplateService,
    );

    const result = await service.dispatchDiagnosisQuoteTemplate({
      serviceOrder: createServiceOrder(),
      commercialVersionId: 42,
      equipmentLabel: 'Laptop Lenovo',
      totalAmount: 280,
      documentUrl: 'https://api.example.com/cotizacion.pdf',
      documentFileName: 'cotizacion.pdf',
      tempDocumentToken: 'token-42',
      isRediagnosis: false,
    });

    expect(inboxChannelService.dispatchTemplateMessage).toHaveBeenCalledTimes(1);
    expect(notificationRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'SENT', attemptCount: 2, nextAttemptAt: null, lastError: null }),
    );
    expect(result).toBe('SENT');
  });

  it('programa tres reintentos posteriores al primer fallo transitorio', async () => {
    const notificationRepository = createMockRepo();
    notificationRepository.findOne.mockResolvedValue(null);
    const attemptRepository = createMockRepo();
    const inboxService = { getThreadForServiceOrder: jest.fn().mockResolvedValue({ clientPhone: '+51932998578', contextToken: 'ctx-201' }) } as any;
    const inboxChannelService = { dispatchTemplateMessage: jest.fn().mockRejectedValue(Object.assign(new Error('Meta temporalmente no disponible'), { status: 503 })) } as any;
    const whatsappTemplateService = { buildPaymentReceiptTemplate: jest.fn().mockReturnValue({
      templateName: 'comprobante_pago_orden_servicio', languageCode: 'es_PE', bodyParameters: ['Juan', 'SO-1', 'B001-1', 'S/ 20.00'],
      quickReplyPayloads: ['CONSULTA'], documentUrl: 'https://api.example.com/receipt.pdf', documentFileName: 'receipt.pdf',
    }) } as any;
    const configService = { get: jest.fn((key: string) => key === 'WHATSAPP_NOTIFICATION_RETRY_DELAYS_MINUTES' ? '1,5,30' : undefined) } as any;
    const service = new ServiceOrderMessageMatrixService(
      notificationRepository as any, attemptRepository as any, inboxService, inboxChannelService,
      whatsappTemplateService, undefined, configService,
    );

    await service.dispatchPaymentReceiptTemplate({
      serviceOrder: createServiceOrder(), electronicDocumentId: 9, documentNumber: 'B001-1', totalAmount: 20,
      documentUrl: 'https://api.example.com/receipt.pdf', documentFileName: 'receipt.pdf', tempDocumentToken: 'token',
    });

    expect(notificationRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'RETRY_SCHEDULED', attemptCount: 1, nextAttemptAt: expect.any(Date),
    }));
  });
});
