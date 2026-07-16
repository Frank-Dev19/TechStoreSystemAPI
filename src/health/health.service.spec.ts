import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const query = jest.fn();
  const dataSource = { query } as unknown as jest.Mocked<DataSource>;
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(dataSource);
  });

  it('reports liveness without querying MySQL', () => {
    expect(service.live()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness after a lightweight query', async () => {
    dataSource.query.mockResolvedValue([{ result: 1 }]);

    await expect(service.ready()).resolves.toEqual({ status: 'ok' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns a generic unavailable response when MySQL fails', async () => {
    dataSource.query.mockRejectedValue(
      new Error('connect ECONNREFUSED mysql.internal:3306'),
    );

    await expect(service.ready()).rejects.toEqual(
      new ServiceUnavailableException({ status: 'unavailable' }),
    );
  });
});
