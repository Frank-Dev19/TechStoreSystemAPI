import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApisPeruBillingClient } from './apisperu-billing.client';

describe('ApisPeruBillingClient', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'APIS_PERU_BASE_URL')
        return 'https://facturacion.apisperu.com/api/v1';
      if (key === 'APIS_PERU_TOKEN') return 'test-token';
      return undefined;
    }),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports provider connection failures as retryable service unavailability', async () => {
    const connectionError = new TypeError('fetch failed', {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    });
    jest.spyOn(global, 'fetch').mockRejectedValue(connectionError);

    const client = new ApisPeruBillingClient(config);

    let caughtError: unknown;
    try {
      await client.sendInvoice({} as never);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ServiceUnavailableException);
    const exception = caughtError as ServiceUnavailableException;
    expect(exception.getStatus()).toBe(503);
    expect(exception.getResponse()).toEqual({
      message:
        'No se pudo conectar con APIs Peru. Verifique la conexion a facturacion.apisperu.com e intente nuevamente.',
      provider: 'APIS_PERU',
      retryable: true,
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });
  });
});
