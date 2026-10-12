import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerQuotationSummary1791244800000 implements MigrationInterface {
  name = 'CustomerQuotationSummary1791244800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `service_order_item_commercial_versions` ADD `customer_summary` varchar(500) NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `service_order_item_commercial_versions` DROP COLUMN `customer_summary`');
  }
}
