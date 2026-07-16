import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const dataSource = { query: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: DataSource, useValue: dataSource }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('serves public liveness without querying MySQL', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it.each(['/health', '/health/ready'])(
    'serves public readiness at %s',
    async (path) => {
      dataSource.query.mockResolvedValue([{ result: 1 }]);
      await request(app.getHttpServer())
        .get(path)
        .expect(200)
        .expect({ status: 'ok' });
    },
  );

  it('returns a non-sensitive 503 when MySQL is unavailable', async () => {
    dataSource.query.mockRejectedValue(
      new Error('connect ECONNREFUSED mysql.internal:3306'),
    );
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(response.body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(response.body)).not.toContain('mysql.internal');
  });
});
