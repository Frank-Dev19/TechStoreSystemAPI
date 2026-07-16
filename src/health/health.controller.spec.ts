import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  const health = {
    live: jest.fn().mockReturnValue({ status: 'ok' }),
    ready: jest.fn().mockResolvedValue({ status: 'ok' }),
  };

  let controller: HealthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();
    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('exposes liveness independently', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(health.ready).not.toHaveBeenCalled();
  });

  it('uses the same readiness check for /health and /health/ready', async () => {
    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(health.ready).toHaveBeenCalledTimes(2);
  });
});
