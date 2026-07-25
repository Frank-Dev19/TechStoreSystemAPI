import { ConfigService } from '@nestjs/config';
import { ServiceOrderWhatsAppTemplateService } from './service-order-whatsapp-template.service';

describe('ServiceOrderWhatsAppTemplateService', () => {
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
      }),
    ).toBeNull();
  });
});
