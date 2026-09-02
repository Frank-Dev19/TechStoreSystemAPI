import { WarrantyDurationUnit } from '../common/enums/warranty-duration-unit.enum';
import { addWarrantyDuration } from './warranty-date.util';

describe('addWarrantyDuration', () => {
  it('adds calendar months without converting them to a fixed number of days', () => {
    const result = addWarrantyDuration(
      new Date('2026-08-29T10:00:00.000Z'),
      1,
      WarrantyDurationUnit.MONTH,
    );

    expect(result.toISOString()).toBe('2026-09-29T10:00:00.000Z');
  });

  it('clamps a calendar month to its final valid day', () => {
    const result = addWarrantyDuration(
      new Date('2026-01-31T10:00:00.000Z'),
      1,
      WarrantyDurationUnit.MONTH,
    );

    expect(result.toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });
});
