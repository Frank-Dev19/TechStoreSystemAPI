import {
  assertMaterialMatch,
  assertReconciliationStage,
  assertUsableSerial,
  assertReviewRole,
} from './material-policy';

describe('internal material policy', () => {
  it('allows confirming material use only while the equipment is in service', () => {
    expect(() => assertReconciliationStage('EN_EJECUCION')).not.toThrow();
    expect(() =>
      assertReconciliationStage('AUTORIZADA_PARA_EJECUCION'),
    ).toThrow('En servicio');
    expect(() => assertReconciliationStage('RESUELTA')).toThrow('En servicio');
  });
  it('blocks reduced quantities until the quote is regularized', () => {
    expect(() =>
      assertMaterialMatch(
        [{ productId: 1, quantity: 2 }],
        [{ productId: 1, quantity: 1 }],
      ),
    ).toThrow('cotización');
  });
  it('matches repeated products by total and rejects extra products', () => {
    expect(() =>
      assertMaterialMatch(
        [
          { productId: 1, quantity: 1 },
          { productId: 1, quantity: 1 },
        ],
        [{ productId: 1, quantity: 2 }],
      ),
    ).not.toThrow();
    expect(() =>
      assertMaterialMatch([], [{ productId: 2, quantity: 1 }]),
    ).toThrow();
  });
  it.each(['UNDER_REVIEW', 'UNUSABLE'])(
    'blocks %s even in stock',
    (condition) => {
      expect(() =>
        assertUsableSerial({ status: 'IN_STOCK', condition }),
      ).toThrow();
    },
  );
  it('does not confuse usable with available', () => {
    expect(() =>
      assertUsableSerial({ status: 'ISSUED', condition: 'USABLE' }),
    ).toThrow();
    expect(() =>
      assertUsableSerial({ status: 'IN_STOCK', condition: 'USABLE' }),
    ).not.toThrow();
  });
  it('restricts review to admin, including users with other operational roles', () => {
    expect(() => assertReviewRole([{ name: 'supervisor' }])).toThrow();
    expect(() => assertReviewRole([{ name: 'technician' }])).toThrow();
    expect(() => assertReviewRole([{ name: 'admin' }])).not.toThrow();
  });
});
