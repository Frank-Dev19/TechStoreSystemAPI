import {
  deliveryDateRange,
  deliveryStatus,
  manualDeliveryQuantity,
} from './delivery-list.service';
describe('delivery register', () => {
  it('includes the last day in Lima using an exclusive following-day boundary', () => {
    expect(deliveryDateRange('2026-09-01', '2026-09-30')).toEqual({
      from: '2026-09-01 00:00:00',
      until: '2026-10-01 00:00:00',
    });
  });
  it('rejects invalid calendar dates and inverted intervals', () => {
    expect(() => deliveryDateRange('2026-02-30')).toThrow();
    expect(() => deliveryDateRange('2026-10-01', '2026-09-30')).toThrow();
  });
  it('does not present returned or unallocated pieces as installed', () => {
    expect(
      deliveryStatus(
        [{ id: 1, quantity: 1, returnedQuantity: 1, saleId: null }] as any,
        true,
        [{ deliveryLineId: 1, quantity: 1 }] as any,
      ),
    ).toBe('RETURNED');
    expect(
      deliveryStatus(
        [{ id: 1, quantity: 2, returnedQuantity: 0, saleId: null }] as any,
        true,
        [{ deliveryLineId: 1, quantity: 1 }] as any,
      ),
    ).toBe('PENDING');
    expect(
      deliveryStatus(
        [{ id: 1, quantity: 1, returnedQuantity: 0, saleId: 3 }] as any,
        false,
        [],
      ),
    ).toBe('SOLD');
  });
  it('requires exact serial selection for serialized manual deliveries', () => {
    expect(manualDeliveryQuantity(false, 1.5, [])).toBe(1.5);
    expect(manualDeliveryQuantity(true, 2, [10, 11])).toBe(2);
    expect(() => manualDeliveryQuantity(true, 1.5, [10])).toThrow('entera');
    expect(() => manualDeliveryQuantity(true, 2, [10])).toThrow('series');
  });
});
