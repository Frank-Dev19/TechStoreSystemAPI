import { ServiceOrder } from '../entities/service-order.entity';
import {
  EquipmentType,
  RequestOrigin,
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderMetricsFactory } from './service-order-metrics.factory';
import { ServiceOrderSlaStageResolverService } from './service-order-sla-stage.resolver';
import { ServiceOrderStageSlaPolicyService } from './service-order-stage-sla-policy.service';

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 1,
    code: 'SO-001',
    operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
    technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
    priority: ServiceOrderPriority.MEDIUM,
    requestOrigin: RequestOrigin.INTERNAL,
    equipmentType: EquipmentType.LAPTOP,
    equipmentTypeOther: null,
    brand: null,
    model: null,
    serialNumber: null,
    accessories: null,
    serviceType: ServiceType.STANDARD_SERVICE,
    initialIssue: 'No enciende',
    estimatedRepairHours: null,
    assignedTechnician: null,
    assignedToTechnicianId: null,
    assignedAt: new Date('2026-01-01T09:00:00.000Z'),
    client: null,
    clientId: null,
    clientSnapshotName: null,
    clientSnapshotDocumentTypeName: null,
    clientSnapshotDocumentNumber: null,
    clientSnapshotPhone: null,
    clientSnapshotEmail: null,
    creator: undefined as any,
    createdBy: 5,
    closer: null,
    closedBy: null,
    canceller: null,
    cancelledBy: null,
    estimatedDeliveryDate: null,
    receivedAt: new Date('2026-01-01T08:00:00.000Z'),
    reviewStartedAt: new Date('2026-01-01T10:00:00.000Z'),
    serviceStartedAt: new Date('2026-01-01T12:00:00.000Z'),
    serviceCompletedAt: new Date('2026-01-01T14:30:00.000Z'),
    readyForPickupAt: null,
    resolvedAt: null,
    deliveredAt: null,
    closedAt: null,
    cancelledAt: null,
    notes: null,
    montoComprometidoVigente: 0,
    montoReconciliado: 0,
    discount: 0,
    cancellationReason: null,
    rating: null,
    ratingComment: null,
    ratedAt: null,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrder;

describe('ServiceOrderMetricsFactory', () => {
  let service: ServiceOrderMetricsFactory;

  beforeEach(() => {
    const stageResolver = new ServiceOrderSlaStageResolverService();
    const slaPolicy = {
      getTargetMinutes: jest.fn(({ stage }: { stage: string }) => {
        if (stage === 'terminal') return null;
        if (stage === 'service') return 180;
        return 240;
      }),
    } as unknown as ServiceOrderStageSlaPolicyService;

    service = new ServiceOrderMetricsFactory(stageResolver, slaPolicy);
  });

  it('builds live SLA and derived metrics for a complete order', () => {
    const now = new Date('2026-01-01T13:00:00.000Z');
    const result = service.build(createServiceOrder(), now);

    expect(result.sla.stage).toBe('service');
    expect(result.sla.targetMinutes).toBe(180);
    expect(result.sla.elapsedMinutes).toBe(60);
    expect(result.sla.remainingMinutes).toBe(120);
    expect(result.sla.breached).toBe(false);
    expect(result.timeMetrics.timeToDiagnosis.valueMinutes).toBe(120);
    expect(result.timeMetrics.timeToServiceStart.valueMinutes).toBe(240);
    expect(result.timeMetrics.timeToService.valueMinutes).toBe(150);
  });

  it('returns partial metrics with nulls when timestamps are missing', () => {
    const now = new Date('2026-01-01T09:30:00.000Z');
    const result = service.build(
      createServiceOrder({
        technicalStatus: ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION,
        assignedAt: null,
        reviewStartedAt: null,
        serviceStartedAt: null,
        serviceCompletedAt: null,
      }),
      now,
    );

    expect(result.sla.stage).toBe('assignment');
    expect(result.timeMetrics.timeToDiagnosis.valueMinutes).toBeNull();
    expect(result.timeMetrics.timeToDiagnosis.isComputable).toBe(false);
    expect(result.timeMetrics.timeToDiagnosis.missingTimestamps).toEqual(['reviewStartedAt']);
    expect(result.timeMetrics.timeToService.valueMinutes).toBeNull();
  });

  it('marks terminal orders without remaining time', () => {
    const result = service.build(
      createServiceOrder({
        technicalStatus: ServiceOrderTechnicalStatus.SIN_SOLUCION,
        resolvedAt: new Date('2026-01-01T15:00:00.000Z'),
        closedAt: new Date('2026-01-01T15:00:00.000Z'),
      }),
      new Date('2026-01-01T16:00:00.000Z'),
    );

    expect(result.sla.stage).toBe('terminal');
    expect(result.sla.targetMinutes).toBeNull();
    expect(result.sla.remainingMinutes).toBeNull();
  });
});
