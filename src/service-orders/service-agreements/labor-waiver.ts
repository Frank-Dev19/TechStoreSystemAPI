import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ServiceOrderLineDiscount } from './entities/service-order-line-discount.entity';
export enum LaborWaiverReason {
  INTERNAL_SERVICE = 'INTERNAL_SERVICE',
}
export type WaiverActor = {
  sub: number;
  roles?: { permissions?: { code: string }[] }[];
};
export function prepareLaborWaiver(
  type: string,
  grossAmount: number,
  reason: string,
  actor: WaiverActor | undefined,
): Partial<ServiceOrderLineDiscount> {
  if (
    type !== 'SERVICE' ||
    reason !== LaborWaiverReason.INTERNAL_SERVICE ||
    !Number.isFinite(grossAmount) ||
    grossAmount <= 0
  ) {
    throw new BadRequestException(
      'Solo se puede exonerar mano de obra con importe original y motivo Servicio interno',
    );
  }
  const permissions = new Set(
    (actor?.roles ?? []).flatMap((role) =>
      (role.permissions ?? []).map((p) => p.code),
    ),
  );
  if (
    !actor?.sub ||
    ![
      'service-order-agreement.apply-discount',
      'service-order-agreement.override-discount-limit',
    ].every((p) => permissions.has(p))
  ) {
    throw new ForbiddenException(
      'No tienes autorización para exonerar mano de obra',
    );
  }
  return {
    pricingConfigId: null,
    ruleName: 'Exoneración de mano de obra: Servicio interno',
    type: 'PERCENTAGE',
    percentage: 100,
    amount: grossAmount,
    maxAllowedPct: 100,
    wasLimitOverridden: false,
    overrideReason: 'Servicio interno',
    appliedByUserId: Number(actor.sub),
    authorizedByUserId: Number(actor.sub),
  };
}
