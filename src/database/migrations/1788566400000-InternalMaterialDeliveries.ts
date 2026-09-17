import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class InternalMaterialDeliveries1788566400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.addColumn(
      'serials',
      new TableColumn({
        name: 'condition',
        type: 'enum',
        enum: ['USABLE', 'UNDER_REVIEW', 'UNUSABLE'],
        default: "'USABLE'",
      }),
    );
    await q.query(
      "UPDATE serials SET `condition` = 'UNUSABLE', status = 'IN_STOCK' WHERE status = 'DAMAGED'",
    );
    await q.addColumn(
      'sale_items',
      new TableColumn({
        name: 'material_sources',
        type: 'json',
        isNullable: true,
      }),
    );
    const id = {
      name: 'id',
      type: 'int',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'increment' as const,
    };
    const int = (name: string, nullable = false) => ({
      name,
      type: 'int',
      isNullable: nullable,
    });
    const bigint = (name: string) => ({ name, type: 'bigint', unsigned: true });
    const decimal = (name: string, zero = false) => ({
      name,
      type: 'decimal',
      precision: 14,
      scale: 4,
      ...(zero ? { default: '0' } : {}),
    });
    const text = (name: string) => ({ name, type: 'text' });
    const created = {
      name: 'createdAt',
      type: 'datetime',
      precision: 6,
      default: 'CURRENT_TIMESTAMP(6)',
    };
    await q.createTable(
      new Table({
        name: 'material_deliveries',
        columns: [
          id,
          bigint('serviceOrderId'),
          bigint('itemId'),
          bigint('versionId'),
          bigint('technicianId'),
          bigint('actorId'),
          created,
        ],
        indices: [
          { columnNames: ['itemId'] },
          { columnNames: ['serviceOrderId'] },
        ],
      }),
    );
    await q.createTable(
      new Table({
        name: 'material_delivery_lines',
        columns: [
          id,
          int('deliveryId'),
          bigint('itemId'),
          bigint('commercialLineId'),
          int('productId'),
          int('lotId', true),
          int('serialId', true),
          {
            name: 'serialCode',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          decimal('quantity'),
          decimal('returnedQuantity', true),
          decimal('unitCost'),
          int('movementId'),
          int('saleId', true),
        ],
        indices: [
          { columnNames: ['itemId'] },
          { columnNames: ['deliveryId'] },
          { columnNames: ['serialId'] },
        ],
      }),
    );
    await q.createTable(
      new Table({
        name: 'material_returns',
        columns: [
          id,
          int('deliveryLineId'),
          decimal('quantity'),
          { name: 'faulty', type: 'tinyint' },
          text('reason'),
          int('movementId'),
          bigint('actorId'),
          created,
        ],
        indices: [{ columnNames: ['deliveryLineId'] }],
      }),
    );
    await q.createTable(
      new Table({
        name: 'material_reconciliations',
        columns: [
          id,
          bigint('itemId'),
          bigint('versionId'),
          { name: 'allocations', type: 'json' },
          { name: 'valid', type: 'tinyint', default: '1' },
          bigint('actorId'),
          { name: 'confirmedAt', type: 'datetime' },
        ],
        indices: [{ columnNames: ['itemId'], isUnique: true }],
      }),
    );
    await q.createTable(
      new Table({
        name: 'material_operations',
        columns: [
          id,
          { name: 'requestKey', type: 'varchar', length: '64' },
          { name: 'fingerprint', type: 'varchar', length: '64' },
          { name: 'action', type: 'varchar', length: '96' },
          bigint('actorId'),
          { name: 'result', type: 'json' },
          created,
        ],
        indices: [{ columnNames: ['requestKey'], isUnique: true }],
      }),
    );
    await q.createTable(
      new Table({
        name: 'serial_condition_events',
        columns: [
          id,
          int('serialId'),
          { name: 'previousCondition', type: 'varchar', length: '16' },
          { name: 'condition', type: 'varchar', length: '16' },
          text('reason'),
          bigint('actorId'),
          int('returnId', true),
          created,
        ],
        indices: [{ columnNames: ['serialId'] }],
      }),
    );
    for (const [table, column, target] of [
      ['material_deliveries', 'itemId', 'service_order_items'],
      [
        'material_deliveries',
        'versionId',
        'service_order_item_commercial_versions',
      ],
      ['material_delivery_lines', 'deliveryId', 'material_deliveries'],
      ['material_delivery_lines', 'serialId', 'serials'],
      [
        'material_delivery_lines',
        'commercialLineId',
        'service_order_item_commercial_lines',
      ],
      ['material_returns', 'deliveryLineId', 'material_delivery_lines'],
      ['material_reconciliations', 'itemId', 'service_order_items'],
    ])
      await q.createForeignKey(
        table,
        new TableForeignKey({
          columnNames: [column],
          referencedTableName: target,
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
      );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      'SELECT COUNT(*) AS count FROM material_deliveries',
    )) as { count: string }[];
    if (Number(rows[0].count))
      throw new Error(
        'No se puede eliminar trazabilidad de entregas. Restaure una base de desarrollo aislada o conserve el esquema.',
      );
    for (const table of [
      'serial_condition_events',
      'material_operations',
      'material_reconciliations',
      'material_returns',
      'material_delivery_lines',
      'material_deliveries',
    ])
      await q.dropTable(table);
    await q.dropColumn('sale_items', 'material_sources');
    await q.query(
      "UPDATE serials SET status = 'DAMAGED' WHERE `condition` <> 'USABLE' AND status = 'IN_STOCK'",
    );
    await q.dropColumn('serials', 'condition');
  }
}
