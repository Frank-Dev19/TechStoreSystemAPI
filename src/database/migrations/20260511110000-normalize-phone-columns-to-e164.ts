import { MigrationInterface, QueryRunner } from 'typeorm';

type PhoneTableConfig = {
  tableName: string;
  columnName: string;
  idColumn?: string;
};

const META_LEGACY_FALLBACK_COUNTRY_CODE = '51';

export class NormalizePhoneColumnsToE16420260511110000 implements MigrationInterface {
  name = 'NormalizePhoneColumnsToE16420260511110000';

  private readonly phoneTables: PhoneTableConfig[] = [
    { tableName: 'clients', columnName: 'phone' },
    { tableName: 'client_contacts', columnName: 'phone' },
    { tableName: 'service_orders', columnName: 'client_snapshot_phone' },
    { tableName: 'service_order_inbox_threads', columnName: 'client_phone_snapshot' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.phoneTables) {
      await this.normalizeTablePhones(queryRunner, table);
    }
  }

  public async down(): Promise<void> {
    // Irreversible data migration: previous raw phone formats are intentionally not restored.
  }

  private async normalizeTablePhones(queryRunner: QueryRunner, config: PhoneTableConfig): Promise<void> {
    const tableExists = await this.tableExists(queryRunner, config.tableName);
    const columnExists = await this.columnExists(queryRunner, config.tableName, config.columnName);
    if (!tableExists || !columnExists) {
      return;
    }

    const idColumn = config.idColumn ?? 'id';
    const rows = await queryRunner.query(
      `SELECT ${idColumn} AS id, ${config.columnName} AS phone FROM ${config.tableName} WHERE ${config.columnName} IS NOT NULL;`,
    );

    for (const row of rows as Array<{ id: number; phone: string | null }>) {
      const normalized = this.normalizePhoneValue(row.phone);
      if (!normalized || normalized === row.phone) {
        continue;
      }

      await queryRunner.query(
        `UPDATE ${config.tableName} SET ${config.columnName} = ? WHERE ${idColumn} = ?;`,
        [normalized, row.id],
      );
    }
  }

  private normalizePhoneValue(value: string | null | undefined): string | undefined {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      return undefined;
    }

    const compact = trimmed.replace(/[\s().-]+/g, '');
    if (!compact) {
      return undefined;
    }

    if (compact.startsWith('+')) {
      const normalized = `+${compact.slice(1).replace(/\D+/g, '')}`;
      return this.isE164(normalized) ? normalized : undefined;
    }

    if (compact.startsWith('00')) {
      const normalized = `+${compact.slice(2).replace(/\D+/g, '')}`;
      return this.isE164(normalized) ? normalized : undefined;
    }

    const digits = compact.replace(/\D+/g, '');
    if (digits.length === 9) {
      return `+${META_LEGACY_FALLBACK_COUNTRY_CODE}${digits}`;
    }

    if (digits.length === 11 && digits.startsWith(META_LEGACY_FALLBACK_COUNTRY_CODE)) {
      return `+${digits}`;
    }

    return undefined;
  }

  private isE164(value: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(value);
  }

  private async tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `
        SELECT 1 AS found
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        LIMIT 1;
      `,
      [tableName],
    );

    return rows.length > 0;
  }

  private async columnExists(queryRunner: QueryRunner, tableName: string, columnName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `
        SELECT 1 AS found
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1;
      `,
      [tableName, columnName],
    );

    return rows.length > 0;
  }
}
