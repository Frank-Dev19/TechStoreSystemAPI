import { Injectable } from '@nestjs/common';
import { ServiceOrderTechnicalStatus } from '../enums';
import { ServiceOrderSlaStage } from '../dto/service-order-sla.dto';

@Injectable()
export class ServiceOrderSlaStageResolverService {
  resolve(status: ServiceOrderTechnicalStatus): ServiceOrderSlaStage {
    switch (status) {
      case ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION:
      case ServiceOrderTechnicalStatus.ASIGNADA:
        return 'assignment';
      case ServiceOrderTechnicalStatus.EN_DIAGNOSTICO:
      case ServiceOrderTechnicalStatus.DIAGNOSTICADA:
      case ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL:
        return 'diagnosis';
      case ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION:
      case ServiceOrderTechnicalStatus.EN_EJECUCION:
      case ServiceOrderTechnicalStatus.BLOQUEADA:
      case ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO:
        return 'service';
      case ServiceOrderTechnicalStatus.RESUELTA:
        return 'pickup';
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        return 'terminal';
      default:
        return 'terminal';
    }
  }
}
