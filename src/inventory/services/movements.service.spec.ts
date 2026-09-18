import { Movement } from '../entities/movement.entity';
import { buildKardexCsv } from './movements.service';

describe('buildKardexCsv', () => {
  it('exports joined kardex data in Spanish with signed quantities', () => {
    const movement = {
      type: 'OUT',
      qty: 2,
      unitCost: 50,
      totalCost: -100,
      reasonCode: 'SALE_CANCELLATION',
      sourceDocType: 'SALE_CANCELLATION',
      occurredAt: new Date(2026, 8, 16, 10, 30),
      balanceQtyPost: 4,
      balanceTotalCostPost: 200,
      balanceAvgCostPost: 50,
      userCreated: 'Recepcionista',
      product: {
        sku: 'MS01',
        name: 'Mouse',
        category: { name: 'Mouse alámbricos' },
      },
      lot: null,
      supplier: null,
    } as unknown as Movement;

    const csv = buildKardexCsv([movement]);

    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"Anulación de venta"');
    expect(csv).toContain('"MS01","Mouse","Mouse alámbricos"');
    expect(csv).toContain('"-2"');
  });
});
