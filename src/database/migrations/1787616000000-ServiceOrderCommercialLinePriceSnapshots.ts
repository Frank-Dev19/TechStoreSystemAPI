import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderCommercialLinePriceSnapshots1787616000000 implements MigrationInterface {
  name = 'ServiceOrderCommercialLinePriceSnapshots1787616000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_item_commercial_lines` ADD `recommended_price_snapshot` decimal(12,2) NULL, ADD `minimum_price_snapshot` decimal(12,2) NULL, ADD `cost_snapshot` decimal(14,4) NULL, ADD `cost_source_snapshot` varchar(32) NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_item_commercial_lines` DROP COLUMN `cost_source_snapshot`, DROP COLUMN `cost_snapshot`, DROP COLUMN `minimum_price_snapshot`, DROP COLUMN `recommended_price_snapshot`',
    );
  }
}
