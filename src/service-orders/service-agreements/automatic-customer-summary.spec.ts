import { buildAutomaticCustomerSummary } from './customer-summary';

describe('Automatic customer concept', () => {
  it('combines technical service and quantities using plus signs', () => {
    expect(buildAutomaticCustomerSummary([
      { type: 'SERVICE', catalogNameSnapshot: 'Servicio técnico', quantity: 1 },
      { type: 'PRODUCT', productId: 1, catalogNameSnapshot: 'RAM', quantity: 2 },
      { type: 'PRODUCT', productId: 2, catalogNameSnapshot: 'SSD 2TB', quantity: 2 },
    ])).toBe('Servicio técnico + 2 RAM + 2 SSD 2TB');
  });
  it('groups the same product without merging different products with the same name', () => {
    expect(buildAutomaticCustomerSummary([
      { type: 'PRODUCT', productId: 1, catalogNameSnapshot: 'RAM', quantity: 1 },
      { type: 'PRODUCT', productId: 1, catalogNameSnapshot: 'RAM', quantity: 2 },
      { type: 'PRODUCT', productId: 2, catalogNameSnapshot: 'RAM', quantity: 1 },
    ])).toBe('3 RAM + 1 RAM');
  });
  it('includes waived labor and fractional supplies, but no removed quantities', () => {
    expect(buildAutomaticCustomerSummary([
      { type: 'SERVICE', catalogNameSnapshot: 'Servicio técnico', quantity: 1, netAmount: 0 },
      { type: 'PRODUCT', catalogNameSnapshot: 'Pasta térmica', quantity: 0.5 },
      { type: 'PRODUCT', catalogNameSnapshot: 'RAM', quantity: 0 },
    ])).toBe('Servicio técnico + 0.5 Pasta térmica');
  });
  it('does not truncate a large order', () => {
    expect(buildAutomaticCustomerSummary(Array.from({ length: 20 }, (_, productId) => ({
      type: 'PRODUCT', productId, catalogNameSnapshot: 'Nombre largo de producto para resumen', quantity: 1,
    })))).toHaveLength(837);
  });
});
