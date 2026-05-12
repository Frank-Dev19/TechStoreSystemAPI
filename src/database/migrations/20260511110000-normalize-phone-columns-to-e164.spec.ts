import { NormalizePhoneColumnsToE16420260511110000 } from './20260511110000-normalize-phone-columns-to-e164';

describe('NormalizePhoneColumnsToE16420260511110000', () => {
  it('normaliza teléfonos convertibles a E.164 en las tablas objetivo', async () => {
    const updates: Array<{ sql: string; params?: unknown[] }> = [];
    const datasetByTable: Record<string, Array<{ id: number; phone: string | null }>> = {
      clients: [
        { id: 1, phone: '999111222' },
        { id: 2, phone: '+51 988 777 666' },
        { id: 3, phone: 'anexo-ventas' },
      ],
      client_contacts: [{ id: 4, phone: '0051988777666' }],
      service_orders: [{ id: 5, phone: '51999111222' }],
      service_order_inbox_threads: [{ id: 6, phone: '+51999111222' }],
    };

    const queryRunner = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('information_schema.TABLES')) {
          return [{ found: 1 }];
        }
        if (sql.includes('information_schema.COLUMNS')) {
          return [{ found: 1 }];
        }
        if (sql.startsWith('SELECT id AS id, phone AS phone FROM clients')) {
          return datasetByTable.clients;
        }
        if (sql.startsWith('SELECT id AS id, phone AS phone FROM client_contacts')) {
          return datasetByTable.client_contacts;
        }
        if (sql.startsWith('SELECT id AS id, client_snapshot_phone AS phone FROM service_orders')) {
          return datasetByTable.service_orders;
        }
        if (sql.startsWith('SELECT id AS id, client_phone_snapshot AS phone FROM service_order_inbox_threads')) {
          return datasetByTable.service_order_inbox_threads;
        }
        if (sql.startsWith('UPDATE ')) {
          updates.push({ sql, params });
        }
        return [];
      }),
    } as any;

    const migration = new NormalizePhoneColumnsToE16420260511110000();
    await migration.up(queryRunner);

    expect(updates).toEqual(
      expect.arrayContaining([
        {
          sql: 'UPDATE clients SET phone = ? WHERE id = ?;',
          params: ['+51999111222', 1],
        },
        {
          sql: 'UPDATE clients SET phone = ? WHERE id = ?;',
          params: ['+51988777666', 2],
        },
        {
          sql: 'UPDATE client_contacts SET phone = ? WHERE id = ?;',
          params: ['+51988777666', 4],
        },
        {
          sql: 'UPDATE service_orders SET client_snapshot_phone = ? WHERE id = ?;',
          params: ['+51999111222', 5],
        },
      ]),
    );
    expect(updates.some((entry) => entry.params?.[1] === 3)).toBe(false);
    expect(updates.some((entry) => entry.params?.[1] === 6)).toBe(false);
  });

  it('omite tablas o columnas inexistentes sin fallar', async () => {
    const executedSql: string[] = [];
    const queryRunner = {
      query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        executedSql.push(sql);
        if (sql.includes('information_schema.TABLES')) {
          return params?.[0] === 'clients' ? [] : [{ found: 1 }];
        }
        if (sql.includes('information_schema.COLUMNS')) {
          return [{ found: 1 }];
        }
        return [];
      }),
    } as any;

    const migration = new NormalizePhoneColumnsToE16420260511110000();
    await migration.up(queryRunner);

    expect(executedSql.some((sql) => sql.startsWith('SELECT id AS id, phone AS phone FROM clients'))).toBe(false);
  });
});
