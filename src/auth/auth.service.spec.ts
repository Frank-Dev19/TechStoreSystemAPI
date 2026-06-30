import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const buildService = (nodeEnv: string) => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'COOKIE_NAME') return 'rt';
        if (key === 'NODE_ENV') return nodeEnv;
        if (key === 'COOKIE_SAMESITE') return 'lax';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new AuthService(
      {} as any,
      {} as any,
      {} as any,
      configService,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service };
  };

  it('marca secure=true para refresh cookie en producción', () => {
    const { service } = buildService('production');
    const response = { cookie: jest.fn() } as any;

    (service as any).setRefreshCookie(response, 'refresh-token');

    expect(response.cookie).toHaveBeenCalledWith(
      'rt',
      'refresh-token',
      expect.objectContaining({ secure: true }),
    );
  });

  it('mantiene secure=false para refresh cookie fuera de producción', () => {
    const { service } = buildService('development');
    const response = { cookie: jest.fn() } as any;

    (service as any).setRefreshCookie(response, 'refresh-token');

    expect(response.cookie).toHaveBeenCalledWith(
      'rt',
      'refresh-token',
      expect.objectContaining({ secure: false }),
    );
  });
});
