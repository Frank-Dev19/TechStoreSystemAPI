import { ConfigService } from '@nestjs/config';
import { ServiceOrderWhatsAppTemplateService } from './service-order-whatsapp-template.service';

describe('ServiceOrderWhatsAppTemplateService', () => {
  it('construye el resumen de recepción con código general y cantidad de equipos', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME') return 'resumen_de_orden_de_servicio';
        if (key === 'WHATSAPP_TEMPLATE_ORDER_INTAKE_LANGUAGE') return 'es_PE';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(
      service.buildOrderIntakeTemplate({
        clientName: 'Juan Pérez',
        orderCode: 'SO-25-08-2026-0001',
        equipmentCount: '2 equipos',
        documentUrl: 'https://api.example.com/resumen.pdf',
        documentFileName: 'resumen.pdf',
        quickReplyPayloads: ['CONSULTA'],
      }),
    ).toEqual({
      templateName: 'resumen_de_orden_de_servicio',
      languageCode: 'es_PE',
      bodyParameters: ['Juan Pérez', 'SO-25-08-2026-0001', '2 equipos'],
      quickReplyPayloads: ['CONSULTA'],
      documentUrl: 'https://api.example.com/resumen.pdf',
      documentFileName: 'resumen.pdf',
    });
  });

  it('usa el idioma específico por template cuando existe', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'WHATSAPP_TEMPLATE_READY_FOR_PICKUP_NAME') return 'equipo_listo_retiro';
        if (key === 'WHATSAPP_TEMPLATE_READY_FOR_PICKUP_LANGUAGE') return 'es_PE';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new ServiceOrderWhatsAppTemplateService(configService);

    const template = service.buildReadyForPickupTemplate({
      clientName: 'Juan',
      orderCode: 'SO-1',
      equipmentLabel: 'Laptop',
    });

    expect(template.templateName).toBe('equipo_listo_retiro');
    expect(template.languageCode).toBe('es_PE');
  });

  it('construye el estado final con documento y una consulta contextual', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(
      service.buildFinalServiceTemplate({
        clientName: 'Juan',
        equipmentLabel: 'Laptop Lenovo ThinkPad',
        itemCode: 'SO-24-08-2026-0001-01',
        documentUrl: 'https://api.example.com/informe-final.pdf',
        documentFileName: 'informe-final.pdf',
        quickReplyPayloads: ['CONSULTA_ESTADO_FINAL:81'],
      }),
    ).toEqual({
      templateName: 'estado_final_servicio',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'Laptop Lenovo ThinkPad', 'SO-24-08-2026-0001-01'],
      quickReplyPayloads: ['CONSULTA_ESTADO_FINAL:81'],
      documentUrl: 'https://api.example.com/informe-final.pdf',
      documentFileName: 'informe-final.pdf',
    });
  });

  it('no construye la encuesta cuando no hay una plantilla aprobada configurada', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(
      service.buildSurveyRequestTemplate({
        clientName: 'Juan',
        orderCode: 'SO-1',
        equipmentLabel: 'Laptop',
        surveyToken: '7.signature',
      }),
    ).toBeNull();
  });

  it('construye una encuesta por orden con un botón URL dinámico', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'WHATSAPP_TEMPLATE_SURVEY_NAME') return 'encuesta_calidad_servicio';
        if (key === 'WHATSAPP_TEMPLATE_SURVEY_LANGUAGE') return 'es_PE';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(service.buildSurveyRequestTemplate({
      clientName: 'Juan',
      orderCode: 'SO-1',
      equipmentLabel: '3 equipos',
      surveyToken: '7.signature',
    })).toEqual({
      templateName: 'encuesta_calidad_servicio',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'SO-1', '3 equipos'],
      quickReplyPayloads: [],
      documentUrl: null,
      documentFileName: null,
      urlButtonParameters: ['7.signature'],
    });
  });

  it('construye una única plantilla de cancelación con documento y cantidad de equipos', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);
    expect(service.buildCancellationSummaryTemplate({
      clientName: 'Juan',
      itemCount: '2',
      orderCode: 'SO-1',
      documentUrl: 'https://api.example.com/document.pdf',
      documentFileName: 'resumen-cancelacion.pdf',
      quickReplyPayloads: ['CONSULTA'],
    })).toEqual({
      templateName: 'resumen_cancelacion_equipos',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', '2', 'SO-1'],
      quickReplyPayloads: ['CONSULTA'],
      documentUrl: 'https://api.example.com/document.pdf',
      documentFileName: 'resumen-cancelacion.pdf',
    });
  });

  it('construye el diagnóstico y cotización inicial con sus cuatro variables y botones', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(service.buildDiagnosisAgreementAvailableTemplate({
      clientName: 'Juan',
      equipmentLabel: 'Laptop Lenovo',
      orderCode: 'SO-1',
      totalAmount: '120.00',
      documentUrl: 'https://api.example.com/cotizacion.pdf',
      documentFileName: 'cotizacion.pdf',
      quickReplyPayloads: ['ACEPTAR_COTIZACION:41', 'CONSULTA'],
    })).toEqual({
      templateName: 'diagnostico_cotizacion_equipo',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'Laptop Lenovo', 'SO-1', '120.00'],
      quickReplyPayloads: ['ACEPTAR_COTIZACION:41', 'CONSULTA'],
      documentUrl: 'https://api.example.com/cotizacion.pdf',
      documentFileName: 'cotizacion.pdf',
    });
  });

  it('construye la plantilla peruana de recotización con el PDF actualizado', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(service.buildRediagnosisAgreementTemplate({
      clientName: 'Juan',
      equipmentLabel: 'Laptop Lenovo ThinkPad',
      orderCode: 'SO-1',
      totalAmount: '280.00',
      documentUrl: 'https://api.example.com/recotizacion.pdf',
      documentFileName: 'recotizacion.pdf',
      quickReplyPayloads: ['ACEPTAR_COTIZACION:42', 'CONSULTA'],
    })).toEqual({
      templateName: 'rediagnostico_recotizacion_equipo',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'Laptop Lenovo ThinkPad', 'SO-1', '280.00'],
      quickReplyPayloads: ['ACEPTAR_COTIZACION:42', 'CONSULTA'],
      documentUrl: 'https://api.example.com/recotizacion.pdf',
      documentFileName: 'recotizacion.pdf',
    });
  });

  it('construye el recordatorio de cotización con el mismo contrato comercial', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(service.buildQuoteReminderTemplate({
      clientName: 'Juan', equipmentLabel: 'Laptop Lenovo', orderCode: 'SO-1', totalAmount: '120.00',
      documentUrl: 'https://api.example.com/quote.pdf', documentFileName: 'quote.pdf',
      quickReplyPayloads: ['ACEPTAR_COTIZACION:41', 'CONSULTA'],
    })).toEqual({
      templateName: 'recordatorio_cotizacion_pendiente',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'Laptop Lenovo', 'SO-1', '120.00'],
      quickReplyPayloads: ['ACEPTAR_COTIZACION:41', 'CONSULTA'],
      documentUrl: 'https://api.example.com/quote.pdf',
      documentFileName: 'quote.pdf',
    });
  });

  it('construye el comprobante aceptado por SUNAT con el PDF oficial', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(service.buildPaymentReceiptTemplate({
      clientName: 'Juan', orderCode: 'SO-1', documentNumber: 'B001-1', totalAmount: 'S/ 120.00',
      documentUrl: 'https://api.example.com/receipt.pdf', documentFileName: 'receipt.pdf',
      quickReplyPayloads: ['CONSULTA'],
    })).toEqual({
      templateName: 'comprobante_pago_orden_servicio',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'SO-1', 'B001-1', 'S/ 120.00'],
      quickReplyPayloads: ['CONSULTA'],
      documentUrl: 'https://api.example.com/receipt.pdf',
      documentFileName: 'receipt.pdf',
    });
  });

  it('construye el recordatorio de recojo consolidado por orden', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const service = new ServiceOrderWhatsAppTemplateService(configService);

    expect(service.buildPickupReminderTemplate({
      clientName: 'Juan', orderCode: 'SO-1', equipmentSummary: '2 equipos',
      documentUrl: 'https://api.example.com/pickup.pdf', documentFileName: 'pickup.pdf',
      quickReplyPayloads: ['CONSULTA'],
    })).toEqual({
      templateName: 'recordatorio_recojo_equipo',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'SO-1', '2 equipos'],
      quickReplyPayloads: ['CONSULTA'],
      documentUrl: 'https://api.example.com/pickup.pdf',
      documentFileName: 'pickup.pdf',
    });
  });
});
