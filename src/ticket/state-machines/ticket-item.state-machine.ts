import { TicketItemStatus, ServiceType } from '../enums';

type TransitionMap = Record<TicketItemStatus, ReadonlyArray<TicketItemStatus>>;

/**
 * Máquina de estados para TicketItem
 * Define las transiciones permitidas entre estados
 */
export const ticketItemStateMachine: TransitionMap = {
  // Estado inicial - común para ambos tipos de servicio
  [TicketItemStatus.ASSIGNED]: [
    TicketItemStatus.IN_DIAGNOSIS,    // Solo para DIAGNOSIS
    TicketItemStatus.QUOTED,          // Para STANDARD_SERVICE (cotizar de inmediato)
    TicketItemStatus.CANCELLED,
  ],

  // Flujo de diagnóstico - solo para DIAGNOSIS
  [TicketItemStatus.IN_DIAGNOSIS]: [
    TicketItemStatus.DIAGNOSED,
    TicketItemStatus.CANCELLED,
  ],

  [TicketItemStatus.DIAGNOSED]: [
    TicketItemStatus.QUOTED,
    TicketItemStatus.CANCELLED,
  ],

  // Listo para iniciar servicio (flujo STANDARD_SERVICE)
  [TicketItemStatus.READY_FOR_REPAIR]: [
    TicketItemStatus.IN_REPAIR,
    TicketItemStatus.QUOTED,
    TicketItemStatus.CANCELLED,
  ],

  // Cotización - común después del diagnóstico o para servicios estándar
  [TicketItemStatus.QUOTED]: [
    TicketItemStatus.SUPERVISOR_APPROVED,   // Para DIAGNOSIS
    TicketItemStatus.SUPERVISOR_REJECTED,   // Para DIAGNOSIS
    TicketItemStatus.CLIENT_APPROVED,       // Para STANDARD_SERVICE (automático)
    TicketItemStatus.QUOTE_EXPIRED,         // Expiración automática de oferta
    TicketItemStatus.CANCELLED,
  ],

  // Flujo de aprobación del supervisor - solo para DIAGNOSIS
  [TicketItemStatus.SUPERVISOR_APPROVED]: [
    TicketItemStatus.SENT_TO_CLIENT,
    TicketItemStatus.CANCELLED,
  ],

  [TicketItemStatus.SUPERVISOR_REJECTED]: [
    TicketItemStatus.QUOTED,          // Recotizar después de corrección
    TicketItemStatus.CANCELLED,
  ],

  [TicketItemStatus.QUOTE_EXPIRED]: [
    TicketItemStatus.QUOTED,          // Reabrir con nueva oferta
    TicketItemStatus.CANCELLED,
  ],

  // Envío al cliente y espera de respuesta - solo para DIAGNOSIS
  [TicketItemStatus.SENT_TO_CLIENT]: [
    TicketItemStatus.AWAITING_CLIENT_RESPONSE,
    TicketItemStatus.CANCELLED,
  ],

  [TicketItemStatus.AWAITING_CLIENT_RESPONSE]: [
    TicketItemStatus.CLIENT_APPROVED,
    TicketItemStatus.CLIENT_REJECTED,
    TicketItemStatus.CANCELLED,
  ],

  // Rechazo del cliente - solo para DIAGNOSIS
  [TicketItemStatus.CLIENT_REJECTED]: [
    TicketItemStatus.DIAGNOSED,       // Volver a diagnosticar
    TicketItemStatus.QUOTED,          // Nueva cotización
    TicketItemStatus.CANCELLED,
  ],

  // Aprobación del cliente - común para ambos flujos
  [TicketItemStatus.CLIENT_APPROVED]: [
    TicketItemStatus.READY_FOR_REPAIR,      // Para STANDARD_SERVICE
    TicketItemStatus.AWAITING_PARTS,
    TicketItemStatus.IN_REPAIR,
    TicketItemStatus.CANCELLED,
  ],

  // Flujo de reparación - común para ambos tipos de servicio
  [TicketItemStatus.AWAITING_PARTS]: [
    TicketItemStatus.IN_REPAIR,
    TicketItemStatus.CANCELLED,
  ],

  [TicketItemStatus.IN_REPAIR]: [
    TicketItemStatus.AWAITING_PARTS,   // Si necesita más repuestos
    TicketItemStatus.REPAIRED,
    TicketItemStatus.QUOTED,           // Si aparece nuevo daño (nueva cotización)
    TicketItemStatus.CANCELLED,
  ],

  [TicketItemStatus.REPAIRED]: [
    TicketItemStatus.DELIVERED,
    TicketItemStatus.CANCELLED,
  ],

  // Estados finales
  [TicketItemStatus.DELIVERED]: [],    // Estado terminal
  [TicketItemStatus.CANCELLED]: [],    // Estado terminal
};

/**
 * Valida si una transición de estado es permitida
 * @param current Estado actual
 * @param next Estado siguiente
 * @param serviceType Tipo de servicio (opcional para validaciones específicas)
 * @returns true si la transición es válida
 */
export const canTransitionTicketItem = (
  current: TicketItemStatus,
  next: TicketItemStatus,
  serviceType?: ServiceType,
): boolean => {
  const allowed = ticketItemStateMachine[current] ?? [];

  if (!allowed.includes(next)) {
    return false;
  }

  // Validaciones específicas por tipo de servicio
  if (serviceType) {
    // Para STANDARD_SERVICE, no se permiten estados de diagnóstico manual ni supervisor
    if (serviceType === ServiceType.STANDARD_SERVICE) {
      const forbiddenStates = [
        TicketItemStatus.IN_DIAGNOSIS,
        TicketItemStatus.DIAGNOSED,
        TicketItemStatus.SUPERVISOR_APPROVED,
        TicketItemStatus.SUPERVISOR_REJECTED,
        TicketItemStatus.SENT_TO_CLIENT,
        TicketItemStatus.AWAITING_CLIENT_RESPONSE,
      ];

      if (forbiddenStates.includes(next)) {
        return false;
      }
    }

    // Para DIAGNOSIS, no se puede saltar directamente de QUOTED a CLIENT_APPROVED
    if (serviceType === ServiceType.DIAGNOSIS) {
      if (current === TicketItemStatus.QUOTED && next === TicketItemStatus.CLIENT_APPROVED) {
        return false;
      }
      if (current === TicketItemStatus.ASSIGNED && next === TicketItemStatus.IN_REPAIR) {
        return false;
      }
    }
  }

  return true;
};
