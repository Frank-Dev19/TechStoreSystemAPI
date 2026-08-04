import { QueryRunner } from 'typeorm';
import { ServiceOrderItemPartialDelivery1785805200000 } from './1785805200000-ServiceOrderItemPartialDelivery';

describe('ServiceOrderItemPartialDelivery1785805200000', () => {
  it('agrega ENTREGA_PARCIAL a las cabeceras y a los equipos', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => queries.push(sql.replace(/\s+/g, ' ').trim())),
    } as unknown as QueryRunner;

    await new ServiceOrderItemPartialDelivery1785805200000().up(queryRunner);

    expect(queries).toHaveLength(2);
    expect(queries.every((sql) => sql.includes("'ENTREGA_PARCIAL'"))).toBe(true);
    expect(queries[0]).toContain('ALTER TABLE `service_orders`');
    expect(queries[1]).toContain('ALTER TABLE `service_order_items`');
  });

  it('normaliza cabeceras parciales antes de retirar el valor al revertir', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => queries.push(sql)),
    } as unknown as QueryRunner;

    await new ServiceOrderItemPartialDelivery1785805200000().down(queryRunner);

    expect(queries[0]).toContain("SET `operative_status` = 'EN_PROCESO'");
    expect(queries.slice(1).every((sql) => !sql.includes("'ENTREGA_PARCIAL'"))).toBe(true);
  });
});
