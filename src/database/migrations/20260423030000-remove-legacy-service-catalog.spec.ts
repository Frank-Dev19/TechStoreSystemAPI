import { RemoveLegacyServiceCatalog20260423030000 } from './20260423030000-remove-legacy-service-catalog';

describe('RemoveLegacyServiceCatalog20260423030000', () => {
  it('elimina FKs legacy, nulifica service_id y borra tablas legacy en up()', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const queryRunner = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });

        if (sql.includes('KEY_COLUMN_USAGE') && params?.[0] === 'service_order_agreement_services') {
          return [{ constraintName: 'fk_agreement_service_id' }];
        }
        if (sql.includes('KEY_COLUMN_USAGE') && params?.[0] === 'sale_items') {
          return [{ constraintName: 'fk_sale_item_service_id' }];
        }
        if (sql.includes('information_schema.COLUMNS')) {
          return [{ found: 1 }];
        }

        return [];
      }),
    } as any;

    const migration = new RemoveLegacyServiceCatalog20260423030000();
    await migration.up(queryRunner);

    expect(calls.some((entry) => entry.sql.includes('ALTER TABLE service_order_agreement_services DROP FOREIGN KEY fk_agreement_service_id'))).toBe(true);
    expect(calls.some((entry) => entry.sql.includes('ALTER TABLE sale_items DROP FOREIGN KEY fk_sale_item_service_id'))).toBe(true);
    expect(calls.some((entry) => entry.sql.includes('UPDATE service_order_agreement_services SET service_id = NULL'))).toBe(true);
    expect(calls.some((entry) => entry.sql.includes('UPDATE sale_items SET service_id = NULL'))).toBe(true);
    expect(calls.some((entry) => entry.sql.includes('DROP TABLE IF EXISTS services'))).toBe(true);
    expect(calls.some((entry) => entry.sql.includes('DROP TABLE IF EXISTS service_categories'))).toBe(true);
  });

  it('recrea tablas legacy y recompone FKs en down()', async () => {
    const executedSql: string[] = [];
    const queryRunner = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        executedSql.push(sql);
        if (sql.includes('information_schema.COLUMNS') && params?.[0] === 'service_order_agreement_services') {
          return [{ found: 1 }];
        }
        if (sql.includes('information_schema.COLUMNS') && params?.[0] === 'sale_items') {
          return [{ found: 1 }];
        }
        return [];
      }),
    } as any;

    const migration = new RemoveLegacyServiceCatalog20260423030000();
    await migration.down(queryRunner);

    expect(executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS service_categories'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS services'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('ADD CONSTRAINT fk_service_order_agreement_services_service_id'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('ADD CONSTRAINT fk_sale_items_service_id'))).toBe(true);
  });
});
