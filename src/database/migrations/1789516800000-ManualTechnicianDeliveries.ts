import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ManualTechnicianDeliveries1789516800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.addColumn(
      'material_deliveries',
      new TableColumn({
        name: 'type',
        type: 'enum',
        enum: ['ORDER', 'MANUAL'],
        default: "'ORDER'",
      }),
    );
    await q.addColumn(
      'material_deliveries',
      new TableColumn({ name: 'notes', type: 'text', isNullable: true }),
    );
    await q.query(
      'ALTER TABLE material_deliveries MODIFY serviceOrderId BIGINT UNSIGNED NULL, MODIFY itemId BIGINT UNSIGNED NULL, MODIFY versionId BIGINT UNSIGNED NULL',
    );
    await q.query(
      'ALTER TABLE material_delivery_lines MODIFY itemId BIGINT UNSIGNED NULL, MODIFY commercialLineId BIGINT UNSIGNED NULL',
    );
    await q.addColumn(
      'material_delivery_lines',
      new TableColumn({
        name: 'productNameSnapshot',
        type: 'varchar',
        length: '256',
        isNullable: true,
      }),
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      "SELECT COUNT(*) AS count FROM material_deliveries WHERE type = 'MANUAL'",
    )) as { count: string }[];
    if (Number(rows[0].count))
      throw new Error(
        'No se puede eliminar trazabilidad de entregas manuales existentes.',
      );
    await q.dropColumn('material_delivery_lines', 'productNameSnapshot');
    await q.query(
      'ALTER TABLE material_delivery_lines MODIFY itemId BIGINT UNSIGNED NOT NULL, MODIFY commercialLineId BIGINT UNSIGNED NOT NULL',
    );
    await q.query(
      'ALTER TABLE material_deliveries MODIFY serviceOrderId BIGINT UNSIGNED NOT NULL, MODIFY itemId BIGINT UNSIGNED NOT NULL, MODIFY versionId BIGINT UNSIGNED NOT NULL',
    );
    await q.dropColumn('material_deliveries', 'notes');
    await q.dropColumn('material_deliveries', 'type');
  }
}
