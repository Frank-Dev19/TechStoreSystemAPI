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
});
