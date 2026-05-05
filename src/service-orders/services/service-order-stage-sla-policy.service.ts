import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceOrderSlaStage } from '../dto/service-order-sla.dto';
import { ServiceOrderPriority, ServiceType } from '../enums';

type SlaPolicyInput = {
  stage: ServiceOrderSlaStage;
  priority: ServiceOrderPriority;
  serviceType: ServiceType;
};

const BASE_TARGETS: Record<ServiceType, Record<Exclude<ServiceOrderSlaStage, 'terminal'>, number>> = {
  [ServiceType.CUSTOMER_SERVICE]: {
    assignment: 30,
    diagnosis: 120,
    service: 240,
    pickup: 720,
  },
  [ServiceType.ASSEMBLY]: {
    assignment: 60,
    diagnosis: 60,
    service: 480,
    pickup: 1440,
  },
  [ServiceType.DIAGNOSIS]: {
    assignment: 60,
    diagnosis: 240,
    service: 120,
    pickup: 1440,
  },
  [ServiceType.STANDARD_SERVICE]: {
    assignment: 120,
    diagnosis: 480,
    service: 1440,
    pickup: 1440,
  },
  [ServiceType.WARRANTY_SERVICE]: {
    assignment: 120,
    diagnosis: 480,
    service: 2880,
    pickup: 2880,
  },
};

const DEFAULT_PRIORITY_MULTIPLIERS: Record<ServiceOrderPriority, number> = {
  [ServiceOrderPriority.HIGH]: 0.5,
  [ServiceOrderPriority.MEDIUM]: 1,
  [ServiceOrderPriority.LOW]: 1.5,
};

@Injectable()
export class ServiceOrderStageSlaPolicyService {
  constructor(private readonly configService: ConfigService) {}

  getTargetMinutes({ stage, priority, serviceType }: SlaPolicyInput): number | null {
    if (stage === 'terminal') {
      return null;
    }

    const envKey = `SERVICE_ORDER_SLA_${serviceType}_${stage.toUpperCase()}_MINUTES`;
    const configuredBase = this.getNumber(envKey);
    const baseMinutes = configuredBase ?? BASE_TARGETS[serviceType][stage];
    const multiplier = this.getNumber(
      `SERVICE_ORDER_SLA_PRIORITY_${priority}_MULTIPLIER`,
    ) ?? DEFAULT_PRIORITY_MULTIPLIERS[priority];

    return Math.max(0, Math.round(baseMinutes * multiplier));
  }

  private getNumber(key: string): number | null {
    const rawValue = this.configService.get<string | number | undefined>(key);
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return null;
    }

    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
