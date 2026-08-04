import { QueryRunner } from 'typeorm';
import { ServiceOrderCommercialDecisions1785794400000 } from './1785794400000-ServiceOrderCommercialDecisions';

describe('ServiceOrderCommercialDecisions1785794400000', () => {
  it('crea un historial append-only con versión, actor, canal y fecha', async () => {
    const executed: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) =>
        executed.push(sql.replace(/\s+/g, ' ').trim()),
      ),
    } as unknown as QueryRunner;

    await new ServiceOrderCommercialDecisions1785794400000().up(queryRunner);

    expect(executed[0]).toContain(
      'CREATE TABLE `service_order_client_decisions`',
    );
    expect(executed[0]).toContain(
      "`decision` enum ('ACCEPTED','CHANGES_REQUESTED')",
    );
    expect(executed[0]).toContain(
      "`channel` enum ('WHATSAPP','PHONE','IN_PERSON','EMAIL','OTHER')",
    );
    expect(executed[0]).toContain('`recorded_by_user_id` int NOT NULL');
    expect(executed[0]).toContain('FK_client_decision_version');
    expect(executed[0]).toContain('FK_client_decision_recorder');
  });

  it('retira únicamente la tabla de decisiones al revertir', async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await new ServiceOrderCommercialDecisions1785794400000().down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      'DROP TABLE `service_order_client_decisions`',
    );
  });
});
