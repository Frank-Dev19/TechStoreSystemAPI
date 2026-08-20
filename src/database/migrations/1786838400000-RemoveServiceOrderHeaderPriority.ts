import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveServiceOrderHeaderPriority1786838400000 implements MigrationInterface {
  name = 'RemoveServiceOrderHeaderPriority1786838400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPriority = await queryRunner.hasColumn('service_orders', 'priority');
    if (!hasPriority) return;

    const orphanRows = (await queryRunner.query(`
      SELECT COUNT(*) AS count
      FROM service_orders serviceOrder
      LEFT JOIN service_order_items item
        ON item.service_order_id = serviceOrder.id
        AND item.deleted_at IS NULL
      WHERE serviceOrder.deleted_at IS NULL
        AND item.id IS NULL
    `)) as Array<{ count: string | number }>;
    const orphanCount = Number(orphanRows[0]?.count ?? 0);
    if (orphanCount > 0) {
      throw new Error(
        `Cannot remove service_orders.priority: ${orphanCount} active service order(s) have no equipment items`,
      );
    }

    await queryRunner.query(`
      UPDATE service_order_items item
      INNER JOIN service_orders serviceOrder ON serviceOrder.id = item.service_order_id
      SET item.priority = COALESCE(item.priority, serviceOrder.priority, 'LOW')
      WHERE item.priority IS NULL
    `);
    await queryRunner.query('ALTER TABLE `service_orders` DROP COLUMN `priority`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPriority = await queryRunner.hasColumn('service_orders', 'priority');
    if (hasPriority) return;

    await queryRunner.query(
      "ALTER TABLE `service_orders` ADD `priority` enum ('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'LOW' AFTER `economic_status`",
    );
    await queryRunner.query(`
      UPDATE service_orders serviceOrder
      SET serviceOrder.priority = CASE
        WHEN EXISTS (
          SELECT 1 FROM service_order_items item
          WHERE item.service_order_id = serviceOrder.id
            AND item.deleted_at IS NULL
            AND item.priority = 'HIGH'
        ) THEN 'HIGH'
        WHEN EXISTS (
          SELECT 1 FROM service_order_items item
          WHERE item.service_order_id = serviceOrder.id
            AND item.deleted_at IS NULL
            AND item.priority = 'MEDIUM'
        ) THEN 'MEDIUM'
        ELSE 'LOW'
      END
    `);
  }
}
