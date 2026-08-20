import { QueryRunner } from 'typeorm';
import { RemoveServiceOrderHeaderPriority1786838400000 } from './1786838400000-RemoveServiceOrderHeaderPriority';

describe('RemoveServiceOrderHeaderPriority1786838400000', () => {
  it('preserva prioridades individuales y elimina la columna de cabecera', async () => {
    const queries: string[] = [];
    const queryRunner = {
      hasColumn: jest.fn().mockResolvedValue(true),
      query: jest.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        queries.push(normalized);
        return normalized.startsWith('SELECT COUNT(*)') ? [{ count: '0' }] : undefined;
      }),
    } as unknown as QueryRunner;

    await new RemoveServiceOrderHeaderPriority1786838400000().up(queryRunner);

    expect(queries.some((sql) => sql.includes('SET item.priority = COALESCE'))).toBe(true);
    expect(queries.at(-1)).toBe('ALTER TABLE `service_orders` DROP COLUMN `priority`');
  });

  it('detiene la migración si existe una orden activa sin equipos', async () => {
    const queryRunner = {
      hasColumn: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue([{ count: '2' }]),
    } as unknown as QueryRunner;

    await expect(new RemoveServiceOrderHeaderPriority1786838400000().up(queryRunner)).rejects.toThrow(
      '2 active service order(s) have no equipment items',
    );
  });

  it('reconstruye una prioridad compatible al revertir', async () => {
    const queries: string[] = [];
    const queryRunner = {
      hasColumn: jest.fn().mockResolvedValue(false),
      query: jest.fn(async (sql: string) => queries.push(sql.replace(/\s+/g, ' ').trim())),
    } as unknown as QueryRunner;

    await new RemoveServiceOrderHeaderPriority1786838400000().down(queryRunner);

    expect(queries[0]).toContain("ADD `priority` enum ('LOW','MEDIUM','HIGH')");
    expect(queries[1]).toContain("item.priority = 'HIGH'");
    expect(queries[1]).toContain("item.priority = 'MEDIUM'");
  });
});
