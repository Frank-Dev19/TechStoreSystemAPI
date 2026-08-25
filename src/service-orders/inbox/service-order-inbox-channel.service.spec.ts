import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ServiceOrderInboxChannelService } from './service-order-inbox-channel.service';

describe('ServiceOrderInboxChannelService', () => {
  const createService = (values: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new ServiceOrderInboxChannelService(configService);
  };

  it('rechaza configuración insegura en producción cuando falta el app secret', () => {
    const service = createService({ NODE_ENV: 'production' });

    expect(() => service.assertWebhookSignature(Buffer.from('payload'), 'sha256=abc')).toThrow(
      InternalServerErrorException,
    );
  });

  it('permite omitir firma fuera de producción si no hay app secret', () => {
    const service = createService({ NODE_ENV: 'development' });

    expect(() => service.assertWebhookSignature(undefined, undefined)).not.toThrow();
  });

  it('acepta firmas válidas', () => {
    const appSecret = 'super-secret';
    const payload = Buffer.from('payload');
    const signature = createHmac('sha256', appSecret).update(payload).digest('hex');
    const service = createService({ NODE_ENV: 'production', WHATSAPP_CLOUD_APP_SECRET: appSecret });

    expect(() => service.assertWebhookSignature(payload, `sha256=${signature}`)).not.toThrow();
  });

  it('rechaza firmas inválidas', () => {
    const service = createService({ NODE_ENV: 'production', WHATSAPP_CLOUD_APP_SECRET: 'super-secret' });

    expect(() => service.assertWebhookSignature(Buffer.from('payload'), 'sha256=deadbeef')).toThrow(
      ForbiddenException,
    );
  });

  it('normaliza el context token del webhook entrante', () => {
    const service = createService({ NODE_ENV: 'development' });

    const result = service.normalizeWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid-1',
                    from: '51999999999',
                    timestamp: '1712345678',
                    text: { body: 'Hola' },
                    context: { biz_opaque_callback_data: 'thread-token-1' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.messages[0]).toEqual(
      expect.objectContaining({
        contextToken: 'thread-token-1',
        externalThreadKey: 'thread-token-1',
      }),
    );
  });

  it('normaliza el payload y el texto visible de una respuesta rápida', () => {
    const service = createService({ NODE_ENV: 'development' });

    const result = service.normalizeWebhookPayload({
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid-button-1',
              from: '51999999999',
              timestamp: '1712345678',
              type: 'button',
              button: {
                payload: 'ACEPTAR_COTIZACION:42',
                text: 'Aceptar cotización',
              },
            }],
          },
        }],
      }],
    });

    expect(result.messages[0]).toEqual(expect.objectContaining({
      text: 'Aceptar cotización',
      quickReplyPayload: 'ACEPTAR_COTIZACION:42',
    }));
  });

  it('usa el número E.164 persistido sin inferencias extra al enviar a Meta', () => {
    const service = createService({ NODE_ENV: 'development' });

    expect((service as any).normalizeRecipientPhone('+51999111222')).toBe('51999111222');
  });

  it('aplica fallback +51 solo para números históricos sin código al enviar a Meta', () => {
    const service = createService({ NODE_ENV: 'development' });

    expect((service as any).normalizeRecipientPhone('999111222')).toBe('51999111222');
  });

  it('dispatches a whatsapp template with document header', async () => {
    const service = createService({
      NODE_ENV: 'development',
      WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1075203729009969',
      WHATSAPP_CLOUD_ACCESS_TOKEN: 'token',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ messages: [{ id: 'wamid.1' }] }),
    });
    global.fetch = fetchMock as any;

    const result = await service.dispatchTemplateMessage({
      clientPhone: '+51932998578',
      templateName: 'ordenes_ingresadas_asignadas',
      languageCode: 'es',
      documentUrl: 'https://stsperu.online/api/service-orders/temp-documents/token',
      documentFileName: 'resumen-ordenes.pdf',
      bodyParameters: ['Juan Pérez', 'tu orden TS-10452'],
      quickReplyPayloads: ['ENTENDIDO', 'CONSULTA'],
      contextToken: 'thread-1',
    });

    expect(result.status).toBe('SENT');
    expect(result.externalMessageId).toBe('wamid.1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"type":"template"'),
      }),
    );
  });

  it('envía el token dinámico en el botón URL de la encuesta', async () => {
    const service = createService({
      NODE_ENV: 'development',
      WHATSAPP_CLOUD_PHONE_NUMBER_ID: '1075203729009969',
      WHATSAPP_CLOUD_ACCESS_TOKEN: 'token',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ messages: [{ id: 'wamid.survey' }] }),
    });
    global.fetch = fetchMock as any;

    await service.dispatchTemplateMessage({
      clientPhone: '+51932998578',
      templateName: 'encuesta_calidad_servicio',
      languageCode: 'es_PE',
      bodyParameters: ['Juan', 'SO-1', '2 equipos'],
      urlButtonParameters: ['7.signature'],
      contextToken: 'thread-1',
    });

    const request = fetchMock.mock.calls[0][1];
    const payload = JSON.parse(request.body);
    expect(payload.template.components).toContainEqual({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: '7.signature' }],
    });
  });
});
