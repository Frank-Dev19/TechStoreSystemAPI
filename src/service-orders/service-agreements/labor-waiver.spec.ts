import { prepareLaborWaiver } from './labor-waiver';
describe('internal labor waiver', () => {
  const actor = {
    sub: 7,
    roles: [
      {
        permissions: [
          { code: 'service-order-agreement.apply-discount' },
          { code: 'service-order-agreement.override-discount-limit' },
        ],
      },
    ],
  };
  it('preserves the full labor amount and author', () => {
    expect(
      prepareLaborWaiver('SERVICE', 80, 'INTERNAL_SERVICE', actor),
    ).toEqual(
      expect.objectContaining({
        amount: 80,
        percentage: 100,
        overrideReason: 'Servicio interno',
        appliedByUserId: 7,
        authorizedByUserId: 7,
      }),
    );
  });
  it('rejects products and unsupported reasons', () => {
    expect(() =>
      prepareLaborWaiver('PRODUCT', 150, 'INTERNAL_SERVICE', actor),
    ).toThrow();
    expect(() => prepareLaborWaiver('SERVICE', 80, 'other', actor)).toThrow();
  });
  it('requires authorization and a recorded labor value', () => {
    expect(() =>
      prepareLaborWaiver('SERVICE', 80, 'INTERNAL_SERVICE', {
        sub: 7,
        roles: [],
      }),
    ).toThrow();
    expect(() =>
      prepareLaborWaiver('SERVICE', 0, 'INTERNAL_SERVICE', actor),
    ).toThrow();
  });
});
