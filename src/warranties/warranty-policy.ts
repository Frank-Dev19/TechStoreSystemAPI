import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WarrantySourceType } from './enums/warranty-source-type.enum';

type ResolveWarrantyTechnicianInput = {
  sourceType: WarrantySourceType;
  originTechnicianId: number | null;
  suggestedTechnicianId?: number | null;
  requestedTechnicianId?: number | null;
  isAdmin?: boolean;
  overrideReason?: string | null;
};

export function resolveWarrantyTechnician(input: ResolveWarrantyTechnicianInput): {
  technicianId: number;
  overridden: boolean;
} {
  if (input.sourceType === WarrantySourceType.PRODUCT) {
    const technicianId = Number(input.requestedTechnicianId ?? input.suggestedTechnicianId ?? 0);
    if (!technicianId) throw new BadRequestException('No se pudo asignar un técnico a la garantía');
    return { technicianId, overridden: false };
  }

  const originTechnicianId = Number(input.originTechnicianId ?? 0);
  if (!originTechnicianId) {
    throw new BadRequestException('La garantía de servicio no tiene técnico responsable original');
  }
  const requestedTechnicianId = Number(input.requestedTechnicianId ?? originTechnicianId);
  if (requestedTechnicianId === originTechnicianId) {
    return { technicianId: originTechnicianId, overridden: false };
  }
  if (!input.isAdmin || !input.overrideReason?.trim()) {
    throw new ForbiddenException(
      'Solo un administrador puede sustituir al técnico original indicando el motivo',
    );
  }
  return { technicianId: requestedTechnicianId, overridden: true };
}
