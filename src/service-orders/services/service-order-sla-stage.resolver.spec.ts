import { ServiceOrderTechnicalStatus } from '../enums';
import { ServiceOrderSlaStageResolverService } from './service-order-sla-stage.resolver';

describe('ServiceOrderSlaStageResolverService', () => {
  let service: ServiceOrderSlaStageResolverService;

  beforeEach(() => {
    service = new ServiceOrderSlaStageResolverService();
  });

  it.each([
    [ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION, 'assignment'],
    [ServiceOrderTechnicalStatus.ASIGNADA, 'assignment'],
    [ServiceOrderTechnicalStatus.EN_DIAGNOSTICO, 'diagnosis'],
    [ServiceOrderTechnicalStatus.DIAGNOSTICADA, 'diagnosis'],
    [ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL, 'diagnosis'],
    [ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION, 'service'],
    [ServiceOrderTechnicalStatus.EN_EJECUCION, 'service'],
    [ServiceOrderTechnicalStatus.BLOQUEADA, 'service'],
    [ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO, 'service'],
    [ServiceOrderTechnicalStatus.RESUELTA, 'pickup'],
    [ServiceOrderTechnicalStatus.GARANTIA_RECHAZADA, 'pickup'],
    [ServiceOrderTechnicalStatus.SIN_SOLUCION, 'terminal'],
  ])('maps %s to %s', (technicalStatus, expectedStage) => {
    expect(service.resolve(technicalStatus)).toBe(expectedStage);
  });
});
