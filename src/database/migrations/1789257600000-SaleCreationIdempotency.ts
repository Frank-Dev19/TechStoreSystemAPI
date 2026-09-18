import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class SaleCreationIdempotency1789257600000 implements MigrationInterface {
  private readonly indexName = 'UQ_sales_company_idempotency_key';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sales');
    if (!table) return;

    if (!table.findColumnByName('idempotency_key')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'idempotency_key',
          type: 'varchar',
          length: '36',
          isNullable: true,
        }),
      );
    }

    const refreshedTable = await queryRunner.getTable('sales');
    if (refreshedTable && !refreshedTable.indices.some((index) => index.name === this.indexName)) {
      await queryRunner.createIndex(
        refreshedTable,
        new TableIndex({
          name: this.indexName,
          columnNames: ['company_id', 'idempotency_key'],
          isUnique: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sales');
    if (!table) return;

    const index = table.indices.find((item) => item.name === this.indexName);
    if (index) await queryRunner.dropIndex(table, index);
    if (table.findColumnByName('idempotency_key')) {
      await queryRunner.dropColumn(table, 'idempotency_key');
    }
  }
}
