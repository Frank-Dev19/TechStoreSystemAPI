import { Injectable } from '@nestjs/common';
import { ServiceOrderSlaDto, ServiceOrderSlaStage } from '../dto/service-order-sla.dto';
import {
  DerivedMetricDto,
  ServiceOrderTimeMetricsDto,
} from '../dto/service-order-time-metrics.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderSlaStageResolverService } from './service-order-sla-stage.resolver';
import { ServiceOrderStageSlaPolicyService } from './service-order-stage-sla-policy.service';

type MetricsBundle = {
  sla: ServiceOrderSlaDto;
  timeMetrics: ServiceOrderTimeMetricsDto;
};

@Injectable()
export class ServiceOrderMetricsFactory {
  constructor(
    private readonly stageResolver: ServiceOrderSlaStageResolverService,
    private readonly slaPolicy: ServiceOrderStageSlaPolicyService,
  ) {}

  build(serviceOrder: ServiceOrder, now = new Date()): MetricsBundle {
    const stage = this.stageResolver.resolve(serviceOrder.technicalStatus);
    const elapsedStart = this.getStageStartAt(serviceOrder, stage);
    const elapsedMinutes = elapsedStart ? this.diffInMinutes(elapsedStart, now) : 0;
    const targetMinutes = this.slaPolicy.getTargetMinutes({
      stage,
      priority: serviceOrder.priority,
      serviceType: serviceOrder.serviceType,
    });

    return {
      sla: {
        stage,
        targetMinutes,
        elapsedMinutes,
        remainingMinutes: targetMinutes === null ? null : Math.max(targetMinutes - elapsedMinutes, 0),
        breached: targetMinutes === null ? false : elapsedMinutes > targetMinutes,
      },
      timeMetrics: {
        timeToDiagnosis: this.buildMetric(
          serviceOrder.receivedAt,
          serviceOrder.reviewStartedAt,
          'receivedAt',
          'reviewStartedAt',
        ),
        timeToServiceStart: this.buildMetric(
          serviceOrder.receivedAt,
          serviceOrder.serviceStartedAt,
          'receivedAt',
          'serviceStartedAt',
        ),
        timeToService: this.buildMetric(
          serviceOrder.serviceStartedAt,
          serviceOrder.serviceCompletedAt,
          'serviceStartedAt',
          'serviceCompletedAt',
        ),
        timeToResolution: this.buildMetric(
          serviceOrder.receivedAt,
          serviceOrder.resolvedAt,
          'receivedAt',
          'resolvedAt',
        ),
        timeToDelivery: this.buildMetric(
          serviceOrder.receivedAt,
          serviceOrder.deliveredAt,
          'receivedAt',
          'deliveredAt',
        ),
      },
    };
  }

  private getStageStartAt(serviceOrder: ServiceOrder, stage: ServiceOrderSlaStage): Date | null {
    switch (stage) {
      case 'assignment':
        return serviceOrder.receivedAt;
      case 'diagnosis':
        return serviceOrder.reviewStartedAt ?? serviceOrder.receivedAt;
      case 'service':
        return serviceOrder.serviceStartedAt
          ?? serviceOrder.reviewStartedAt
          ?? serviceOrder.assignedAt
          ?? serviceOrder.receivedAt;
      case 'pickup':
        return serviceOrder.readyForPickupAt ?? serviceOrder.resolvedAt ?? serviceOrder.serviceCompletedAt;
      case 'terminal':
      default:
        return null;
    }
  }

  private buildMetric(
    startAt: Date | null,
    endAt: Date | null,
    startFieldName: string,
    endFieldName: string,
  ): DerivedMetricDto {
    const missingTimestamps = [
      ...(startAt ? [] : [startFieldName]),
      ...(endAt ? [] : [endFieldName]),
    ];

    if (!startAt || !endAt) {
      return {
        valueMinutes: null,
        isComputable: false,
        missingTimestamps,
      };
    }

    return {
      valueMinutes: this.diffInMinutes(startAt, endAt),
      isComputable: true,
      missingTimestamps: [],
    };
  }

  private diffInMinutes(startAt: Date, endAt: Date): number {
    return Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60000));
  }
}
