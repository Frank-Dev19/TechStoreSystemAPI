import { TicketItemStatus } from '../enums';

type TransitionMap = Record<TicketItemStatus, ReadonlyArray<TicketItemStatus>>;

export const ticketItemStateMachine: TransitionMap = {
  [TicketItemStatus.RECEIVED]: [TicketItemStatus.ASSIGNED, TicketItemStatus.CANCELLED],
  [TicketItemStatus.ASSIGNED]: [TicketItemStatus.IN_DIAGNOSIS, TicketItemStatus.CANCELLED],
  [TicketItemStatus.IN_DIAGNOSIS]: [TicketItemStatus.DIAGNOSED, TicketItemStatus.CANCELLED],
  [TicketItemStatus.DIAGNOSED]: [TicketItemStatus.QUOTED, TicketItemStatus.CANCELLED],
  [TicketItemStatus.QUOTED]: [
    TicketItemStatus.QUOTE_SENT,
    TicketItemStatus.CANCELLED,
  ],
  [TicketItemStatus.QUOTE_SENT]: [
    TicketItemStatus.QUOTED,
    TicketItemStatus.QUOTE_APPROVED,
    TicketItemStatus.QUOTE_REJECTED,
    TicketItemStatus.CANCELLED,
  ],
  [TicketItemStatus.QUOTE_APPROVED]: [
    TicketItemStatus.AWAITING_PARTS,
    TicketItemStatus.IN_REPAIR,
    TicketItemStatus.READY_FOR_DELIVERY,
    TicketItemStatus.CANCELLED,
  ],
  [TicketItemStatus.QUOTE_REJECTED]: [TicketItemStatus.QUOTED, TicketItemStatus.CANCELLED],
  [TicketItemStatus.AWAITING_PARTS]: [TicketItemStatus.IN_REPAIR, TicketItemStatus.CANCELLED],
  [TicketItemStatus.IN_REPAIR]: [
    TicketItemStatus.AWAITING_PARTS,
    TicketItemStatus.REPAIRED,
    TicketItemStatus.CANCELLED,
  ],
  [TicketItemStatus.REPAIRED]: [TicketItemStatus.READY_FOR_DELIVERY, TicketItemStatus.CANCELLED],
  [TicketItemStatus.READY_FOR_DELIVERY]: [
    TicketItemStatus.DELIVERED,
    TicketItemStatus.CANCELLED,
  ],
  [TicketItemStatus.DELIVERED]: [],
  [TicketItemStatus.CANCELLED]: [],
};

export const canTransitionTicketItem = (
  current: TicketItemStatus,
  next: TicketItemStatus,
): boolean => {
  const allowed = ticketItemStateMachine[current] ?? [];
  return allowed.includes(next);
};
