import { QueryRunner } from 'typeorm';
import { ServiceOrderLineDiscounts1785798000000 } from './1785798000000-ServiceOrderLineDiscounts';

describe('ServiceOrderLineDiscounts1785798000000', () => {
  it('crea snapshots de descuento por línea con regla, límite, actor y override', async () => {
    const executed: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) =>
        executed.push(sql.replace(/\s+/g, ' ').trim()),
      ),
    } as unknown as QueryRunner;

    await new ServiceOrderLineDiscounts1785798000000().up(queryRunner);

    expect(executed[0]).toContain(
      'CREATE TABLE `service_order_line_discounts`',
    );
    expect(executed[0]).toContain('`percentage` decimal(8,4) NOT NULL');
    expect(executed[0]).toContain('`max_allowed_pct` decimal(8,4) NOT NULL');
    expect(executed[0]).toContain('`was_limit_overridden` tinyint NOT NULL');
    expect(executed[0]).toContain('`applied_by_user_id` int NOT NULL');
    expect(executed[0]).toContain('FK_service_order_line_discount_line');
  });

  it('retira únicamente la tabla de snapshots de descuento al revertir', async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await new ServiceOrderLineDiscounts1785798000000().down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      'DROP TABLE `service_order_line_discounts`',
    );
  });
});
