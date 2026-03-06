import { ServiceOrderItemStatus, ServiceType } from '../enums';

type TransitionMap = Record<ServiceOrderItemStatus, ReadonlyArray<ServiceOrderItemStatus>>;

/**
 * Máquina de estados para ServiceOrderItem
 * Define las transiciones permitidas entre estados
 */
export const serviceOrderItemStateMachine: TransitionMap = {
  // Estado inicial
  [ServiceOrderItemStatus.ASSIGNED]: [
    ServiceOrderItemStatus.IN_DIAGNOSIS,
    ServiceOrderItemStatus.QUOTED,
    ServiceOrderItemStatus.IN_REPAIR,
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Flujo de diagnóstico - solo para DIAGNOSIS
  [ServiceOrderItemStatus.IN_DIAGNOSIS]: [
    ServiceOrderItemStatus.DIAGNOSED,
    ServiceOrderItemStatus.CANCELLED,
  ],

  [ServiceOrderItemStatus.DIAGNOSED]: [
    ServiceOrderItemStatus.QUOTED,
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Listo para iniciar servicio (flujo STANDARD_SERVICE)
  [ServiceOrderItemStatus.READY_FOR_REPAIR]: [
    ServiceOrderItemStatus.IN_REPAIR,
    ServiceOrderItemStatus.QUOTED,
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Cotización - común después del diagnóstico o para servicios estándar
  [ServiceOrderItemStatus.QUOTED]: [
    ServiceOrderItemStatus.SENT_TO_CLIENT,
    ServiceOrderItemStatus.CLIENT_APPROVED,       // Para STANDARD_SERVICE (automático)
    ServiceOrderItemStatus.QUOTE_EXPIRED,         // Expiración automática de oferta
    ServiceOrderItemStatus.CANCELLED,
  ],

  [ServiceOrderItemStatus.QUOTE_EXPIRED]: [
    ServiceOrderItemStatus.QUOTED,          // Reabrir con nueva oferta
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Envío al cliente y espera de respuesta - solo para DIAGNOSIS
  [ServiceOrderItemStatus.SENT_TO_CLIENT]: [
    ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE,
    ServiceOrderItemStatus.CANCELLED,
  ],

  [ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE]: [
    ServiceOrderItemStatus.CLIENT_APPROVED,
    ServiceOrderItemStatus.CLIENT_REJECTED,
    ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT,
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Rechazo del cliente - solo para DIAGNOSIS
  [ServiceOrderItemStatus.CLIENT_REJECTED]: [
    ServiceOrderItemStatus.DIAGNOSED,       // Volver a diagnosticar
    ServiceOrderItemStatus.QUOTED,          // Nueva cotización
    ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT,
    ServiceOrderItemStatus.CANCELLED,
  ],

  [ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT]: [], // Estado terminal

  // Aprobación del cliente - común para ambos flujos
  [ServiceOrderItemStatus.CLIENT_APPROVED]: [
    ServiceOrderItemStatus.READY_FOR_REPAIR,      // Para STANDARD_SERVICE
    ServiceOrderItemStatus.AWAITING_PARTS,
    ServiceOrderItemStatus.IN_REPAIR,
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Flujo de reparación - común para ambos tipos de servicio
  [ServiceOrderItemStatus.AWAITING_PARTS]: [
    ServiceOrderItemStatus.IN_REPAIR,
    ServiceOrderItemStatus.CANCELLED,
  ],

  [ServiceOrderItemStatus.IN_REPAIR]: [
    ServiceOrderItemStatus.AWAITING_PARTS,   // Si necesita más repuestos
    ServiceOrderItemStatus.REPAIRED,
    ServiceOrderItemStatus.IN_DIAGNOSIS,     // Si necesita nuevo diagnóstico
    ServiceOrderItemStatus.QUOTED,           // Si aparece nuevo daño (nueva cotización)
    ServiceOrderItemStatus.CANCELLED,
  ],

  [ServiceOrderItemStatus.REPAIRED]: [
    ServiceOrderItemStatus.DELIVERED,
    ServiceOrderItemStatus.CANCELLED,
  ],

  // Estados finales
  [ServiceOrderItemStatus.DELIVERED]: [],    // Estado terminal
  [ServiceOrderItemStatus.CANCELLED]: [],    // Estado terminal
};

/**
 * Valida si una transición de estado es permitida
 * @param current Estado actual
 * @param next Estado siguiente
 * @param serviceType Tipo de servicio (opcional para validaciones específicas)
 * @returns true si la transición es válida
 */
export const canTransitionServiceOrderItem = (
  current: ServiceOrderItemStatus,
  next: ServiceOrderItemStatus,
  serviceType?: ServiceType,
): boolean => {
  const allowed = serviceOrderItemStateMachine[current] ?? [];

  if (!allowed.includes(next)) {
    return false;
  }

  // Validaciones específicas por tipo de servicio
  if (serviceType) {
    if (serviceType === ServiceType.STANDARD_SERVICE) {
      const forbiddenStates = [
        ServiceOrderItemStatus.IN_DIAGNOSIS,
        ServiceOrderItemStatus.DIAGNOSED,
        ServiceOrderItemStatus.SENT_TO_CLIENT,
        ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE,
      ];

      if (forbiddenStates.includes(next)) {
        return false;
      }
    }

    if ([ServiceType.DIAGNOSIS, ServiceType.CUSTOMER_SERVICE].includes(serviceType)) {
      if (current === ServiceOrderItemStatus.QUOTED && next === ServiceOrderItemStatus.CLIENT_APPROVED) {
        return false;
      }
      if (current === ServiceOrderItemStatus.ASSIGNED && next === ServiceOrderItemStatus.IN_REPAIR) {
        return false;
      }
    }

    if (serviceType === ServiceType.ASSEMBLY) {
      const forbiddenStates = [
        ServiceOrderItemStatus.IN_DIAGNOSIS,
        ServiceOrderItemStatus.DIAGNOSED,
        ServiceOrderItemStatus.QUOTED,
        ServiceOrderItemStatus.SENT_TO_CLIENT,
        ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE,
        ServiceOrderItemStatus.CLIENT_APPROVED,
        ServiceOrderItemStatus.CLIENT_REJECTED,
        ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT,
        ServiceOrderItemStatus.QUOTE_EXPIRED,
        ServiceOrderItemStatus.READY_FOR_REPAIR,
      ];

      if (forbiddenStates.includes(next)) {
        return false;
      }
    }
  }

  return true;
};
