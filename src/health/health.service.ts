import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type HealthStatus = { status: 'ok' | 'unavailable' };

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  live(): HealthStatus {
    return { status: 'ok' };
  }

  async ready(): Promise<HealthStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
