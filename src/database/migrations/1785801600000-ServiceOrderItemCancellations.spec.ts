import { QueryRunner } from 'typeorm';
import { ServiceOrderItemCancellations1785801600000 } from './1785801600000-ServiceOrderItemCancellations';

describe('ServiceOrderItemCancellations1785801600000', () => {
  it('agrega el estado pendiente y crea la trazabilidad de cancelación por equipo', async () => {
    const executed: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) =>
        executed.push(sql.replace(/\s+/g, ' ').trim()),
      ),
    } as unknown as QueryRunner;

    await new ServiceOrderItemCancellations1785801600000().up(queryRunner);

    expect(executed.join(' ')).toContain("'CANCELACION_SOLICITADA'");
    expect(executed.join(' ')).toContain(
      'CREATE TABLE `service_order_item_cancellation_requests`',
    );
    expect(executed.join(' ')).toContain('`requested_by_user_id` int NOT NULL');
    expect(executed.join(' ')).toContain('`previous_operative_status`');
    expect(executed.join(' ')).toContain(
      'FK_service_order_item_cancellation_item',
    );
  });

  it('elimina la tabla antes de retirar el valor del enum al revertir', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => queries.push(sql)),
    } as unknown as QueryRunner;

    await new ServiceOrderItemCancellations1785801600000().down(queryRunner);

    expect(queries[0]).toContain(
      'DROP TABLE `service_order_item_cancellation_requests`',
    );
    expect(queries.some((sql) => sql.includes('CANCELACION_SOLICITADA'))).toBe(
      true,
    );
  });
});
