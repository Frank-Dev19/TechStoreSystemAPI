import { BadRequestException } from '@nestjs/common';

export enum DispatchRequestType {
  INTERNAL_SUPPLY = 'INTERNAL_SUPPLY',
  WARRANTY_REPLACEMENT = 'WARRANTY_REPLACEMENT',
}

export enum DispatchRequestStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export function assertDispatchCanBeFulfilled(status: DispatchRequestStatus): void {
  if (status !== DispatchRequestStatus.PENDING) {
    throw new BadRequestException('La solicitud ya fue atendida');
  }
}

export function statusAfterFulfillment(type: DispatchRequestType): DispatchRequestStatus {
  return type === DispatchRequestType.WARRANTY_REPLACEMENT
    ? DispatchRequestStatus.DELIVERED
    : DispatchRequestStatus.CONFIRMED;
}

export function assertDispatchCanBeConfirmed(
  type: DispatchRequestType,
  status: DispatchRequestStatus,
): void {
  if (
    type !== DispatchRequestType.WARRANTY_REPLACEMENT ||
    status !== DispatchRequestStatus.DELIVERED
  ) {
    throw new BadRequestException('El reemplazo no está pendiente de confirmación');
  }
}
