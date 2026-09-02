import { ForbiddenException } from '@nestjs/common';
import { WarrantySourceType } from './enums/warranty-source-type.enum';
import { resolveWarrantyTechnician } from './warranty-policy';

describe('resolveWarrantyTechnician', () => {
  it('uses the original technician for service-origin coverage', () => {
    expect(
      resolveWarrantyTechnician({
        sourceType: WarrantySourceType.SERVICE,
        originTechnicianId: 12,
        suggestedTechnicianId: 44,
      }),
    ).toEqual({ technicianId: 12, overridden: false });
  });

  it('uses normal assignment for product-origin coverage', () => {
    expect(
      resolveWarrantyTechnician({
        sourceType: WarrantySourceType.PRODUCT,
        originTechnicianId: null,
        suggestedTechnicianId: 44,
      }),
    ).toEqual({ technicianId: 44, overridden: false });
  });

  it('requires an administrator and a reason to substitute the original technician', () => {
    expect(() =>
      resolveWarrantyTechnician({
        sourceType: WarrantySourceType.SERVICE,
        originTechnicianId: 12,
        suggestedTechnicianId: 44,
        requestedTechnicianId: 44,
        isAdmin: false,
        overrideReason: 'Técnico original inactivo',
      }),
    ).toThrow(ForbiddenException);
  });
});
