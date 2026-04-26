import {
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';

export const serviceOrderTransitionMap = {
  operativo: {
    [ServiceOrderOperativeStatus.ABIERTA]: [
      ServiceOrderOperativeStatus.EN_PROCESO,
      ServiceOrderOperativeStatus.CANCELADA,
    ],
    [ServiceOrderOperativeStatus.EN_PROCESO]: [
      ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
      ServiceOrderOperativeStatus.CANCELADA,
      ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
    ],
    [ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA]: [ServiceOrderOperativeStatus.ENTREGADA],
    [ServiceOrderOperativeStatus.ENTREGADA]: [],
    [ServiceOrderOperativeStatus.CANCELADA]: [],
    [ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION]: [],
  },
  tecnico: {
    [ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION]: [ServiceOrderTechnicalStatus.ASIGNADA],
    [ServiceOrderTechnicalStatus.ASIGNADA]: [ServiceOrderTechnicalStatus.EN_DIAGNOSTICO],
    [ServiceOrderTechnicalStatus.EN_DIAGNOSTICO]: [
      ServiceOrderTechnicalStatus.DIAGNOSTICADA,
      ServiceOrderTechnicalStatus.BLOQUEADA,
      ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO,
    ],
    [ServiceOrderTechnicalStatus.DIAGNOSTICADA]: [
      ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      ServiceOrderTechnicalStatus.SIN_SOLUCION,
    ],
    [ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL]: [
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      ServiceOrderTechnicalStatus.SIN_SOLUCION,
    ],
    [ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION]: [ServiceOrderTechnicalStatus.EN_EJECUCION],
    [ServiceOrderTechnicalStatus.EN_EJECUCION]: [
      ServiceOrderTechnicalStatus.BLOQUEADA,
      ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO,
      ServiceOrderTechnicalStatus.RESUELTA,
      ServiceOrderTechnicalStatus.SIN_SOLUCION,
    ],
    [ServiceOrderTechnicalStatus.BLOQUEADA]: [
      ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
      ServiceOrderTechnicalStatus.EN_EJECUCION,
    ],
    [ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO]: [
      ServiceOrderTechnicalStatus.EN_DIAGNOSTICO,
      ServiceOrderTechnicalStatus.EN_EJECUCION,
    ],
    [ServiceOrderTechnicalStatus.RESUELTA]: [],
    [ServiceOrderTechnicalStatus.SIN_SOLUCION]: [],
  },
  comercial: {
    [ServiceOrderCommercialStatus.NO_REQUIERE]: [],
    [ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA]: [ServiceOrderCommercialStatus.PROPUESTA_EMITIDA],
    [ServiceOrderCommercialStatus.PROPUESTA_EMITIDA]: [
      ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE,
      ServiceOrderCommercialStatus.REEMPLAZADA,
      ServiceOrderCommercialStatus.EXPIRADA,
    ],
    [ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE]: [
      ServiceOrderCommercialStatus.AUTORIZADA,
      ServiceOrderCommercialStatus.RECHAZADA,
      ServiceOrderCommercialStatus.EXPIRADA,
      ServiceOrderCommercialStatus.REEMPLAZADA,
    ],
    [ServiceOrderCommercialStatus.AUTORIZADA]: [],
    [ServiceOrderCommercialStatus.RECHAZADA]: [],
    [ServiceOrderCommercialStatus.EXPIRADA]: [ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA],
    [ServiceOrderCommercialStatus.REEMPLAZADA]: [],
  },
  economico: {
    [ServiceOrderEconomicStatus.NO_APLICA]: [],
    [ServiceOrderEconomicStatus.PENDIENTE]: [
      ServiceOrderEconomicStatus.PARCIAL,
      ServiceOrderEconomicStatus.TOTAL,
      ServiceOrderEconomicStatus.EXONERADO,
    ],
    [ServiceOrderEconomicStatus.PARCIAL]: [
      ServiceOrderEconomicStatus.TOTAL,
      ServiceOrderEconomicStatus.PENDIENTE,
      ServiceOrderEconomicStatus.REVERTIDO,
      ServiceOrderEconomicStatus.EXONERADO,
    ],
    [ServiceOrderEconomicStatus.TOTAL]: [
      ServiceOrderEconomicStatus.PARCIAL,
      ServiceOrderEconomicStatus.REVERTIDO,
    ],
    [ServiceOrderEconomicStatus.EXONERADO]: [],
    [ServiceOrderEconomicStatus.REVERTIDO]: [
      ServiceOrderEconomicStatus.PENDIENTE,
      ServiceOrderEconomicStatus.PARCIAL,
      ServiceOrderEconomicStatus.TOTAL,
    ],
  },
} as const;

export type ServiceOrderTransitionAxis = keyof typeof serviceOrderTransitionMap;
