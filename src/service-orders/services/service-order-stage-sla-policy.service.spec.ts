import { ConfigService } from '@nestjs/config';
import { ServiceOrderPriority, ServiceType } from '../enums';
import { ServiceOrderStageSlaPolicyService } from './service-order-stage-sla-policy.service';

describe('ServiceOrderStageSlaPolicyService', () => {
  let service: ServiceOrderStageSlaPolicyService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SERVICE_ORDER_SLA_PRIORITY_HIGH_MULTIPLIER: '0.5',
          SERVICE_ORDER_SLA_PRIORITY_MEDIUM_MULTIPLIER: '1',
          SERVICE_ORDER_SLA_PRIORITY_LOW_MULTIPLIER: '1.5',
          SERVICE_ORDER_SLA_DIAGNOSIS_DIAGNOSIS_MINUTES: '240',
          SERVICE_ORDER_SLA_STANDARD_SERVICE_SERVICE_MINUTES: '1440',
        };

        return values[key];
      }),
    } as unknown as ConfigService;

    service = new ServiceOrderStageSlaPolicyService(configService);
  });

  it('applies priority multiplier over the base target', () => {
    expect(
      service.getTargetMinutes({
        stage: 'diagnosis',
        priority: ServiceOrderPriority.HIGH,
        serviceType: ServiceType.DIAGNOSIS,
      }),
    ).toBe(120);
  });

  it('falls back to default target when env override is missing', () => {
    expect(
      service.getTargetMinutes({
        stage: 'service',
        priority: ServiceOrderPriority.MEDIUM,
        serviceType: ServiceType.STANDARD_SERVICE,
      }),
    ).toBe(1440);
  });

  it('returns null for terminal stage', () => {
    expect(
      service.getTargetMinutes({
        stage: 'terminal',
        priority: ServiceOrderPriority.LOW,
        serviceType: ServiceType.WARRANTY_SERVICE,
      }),
    ).toBeNull();
  });
});
