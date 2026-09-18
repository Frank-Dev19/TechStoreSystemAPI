import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class ElectronicDocumentCancellation1788739200000 implements MigrationInterface {
  private readonly columns = [
    new TableColumn({
      name: 'cancellation_status',
      type: 'varchar',
      length: '20',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_endpoint',
      type: 'varchar',
      length: '40',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_ticket',
      type: 'varchar',
      length: '100',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_reason',
      type: 'varchar',
      length: '250',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_observations',
      type: 'text',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_requested_by',
      type: 'varchar',
      length: '100',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_payload_json',
      type: 'json',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_response_json',
      type: 'json',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_error_message',
      type: 'text',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_requested_at',
      type: 'datetime',
      isNullable: true,
    }),
    new TableColumn({
      name: 'cancellation_resolved_at',
      type: 'datetime',
      isNullable: true,
    }),
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('electronic_documents');
    if (!table) return;
    for (const column of this.columns) {
      if (!table.findColumnByName(column.name)) {
        await queryRunner.addColumn(table, column);
      }
    }

    const sales = await queryRunner.getTable('sales');
    if (sales) {
      const saleColumns = [
        new TableColumn({
          name: 'refunded_by',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
        new TableColumn({
          name: 'refunded_reason',
          type: 'text',
          isNullable: true,
        }),
        new TableColumn({
          name: 'refunded_at',
          type: 'datetime',
          isNullable: true,
        }),
        new TableColumn({
          name: 'refund_method',
          type: 'varchar',
          length: '20',
          isNullable: true,
        }),
      ];
      for (const column of saleColumns) {
        if (!sales.findColumnByName(column.name))
          await queryRunner.addColumn(sales, column);
      }
    }

    if (!(await queryRunner.hasTable('electronic_credit_notes'))) {
      await queryRunner.createTable(
        new Table({
          name: 'electronic_credit_notes',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            { name: 'sale_id', type: 'int' },
            { name: 'company_id', type: 'int' },
            { name: 'series', type: 'varchar', length: '10' },
            { name: 'number', type: 'varchar', length: '15' },
            {
              name: 'reason_code',
              type: 'varchar',
              length: '4',
              default: "'06'",
            },
            { name: 'reason', type: 'varchar', length: '250' },
            { name: 'observations', type: 'text', isNullable: true },
            { name: 'refund_method', type: 'varchar', length: '20' },
            { name: 'amount', type: 'decimal', precision: 16, scale: 2 },
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'PENDING'",
            },
            { name: 'payload_json', type: 'json', isNullable: true },
            { name: 'response_json', type: 'json', isNullable: true },
            { name: 'xml', type: 'mediumtext', isNullable: true },
            { name: 'cdr_zip', type: 'mediumtext', isNullable: true },
            { name: 'sunat_description', type: 'text', isNullable: true },
            { name: 'error_message', type: 'text', isNullable: true },
            { name: 'created_by', type: 'varchar', length: '100' },
            { name: 'accepted_at', type: 'datetime', isNullable: true },
            {
              name: 'created_at',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );
      await queryRunner.createForeignKey(
        'electronic_credit_notes',
        new TableForeignKey({
          columnNames: ['sale_id'],
          referencedTableName: 'sales',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
      );
      await queryRunner.createIndex(
        'electronic_credit_notes',
        new TableIndex({
          name: 'IDX_electronic_credit_notes_sale_reason',
          columnNames: ['sale_id', 'reason_code'],
        }),
      );
      await queryRunner.createIndex(
        'electronic_credit_notes',
        new TableIndex({
          name: 'UQ_electronic_credit_notes_company_series_number',
          columnNames: ['company_id', 'series', 'number'],
          isUnique: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('electronic_credit_notes')) {
      await queryRunner.dropTable('electronic_credit_notes', true);
    }
    const sales = await queryRunner.getTable('sales');
    if (sales) {
      for (const name of [
        'refund_method',
        'refunded_at',
        'refunded_reason',
        'refunded_by',
      ]) {
        if (sales.findColumnByName(name))
          await queryRunner.dropColumn(sales, name);
      }
    }
    const table = await queryRunner.getTable('electronic_documents');
    if (!table) return;
    for (const column of [...this.columns].reverse()) {
      if (table.findColumnByName(column.name)) {
        await queryRunner.dropColumn(table, column.name);
      }
    }
  }
}
