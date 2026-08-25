import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialVersionIssuedAt1787788801000 implements MigrationInterface {
  name = 'CommercialVersionIssuedAt1787788801000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_item_commercial_versions` ADD `issued_at` datetime NULL AFTER `created_by_user_id`',
    );
    await queryRunner.query(
      "UPDATE `service_order_item_commercial_versions` SET `issued_at` = `created_at` WHERE `status` IN ('ISSUED', 'ACCEPTED', 'REJECTED', 'REPLACED') AND `issued_at` IS NULL",
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_service_order_commercial_version_reminder` ON `service_order_item_commercial_versions` (`status`, `issued_at`)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_service_order_commercial_version_reminder` ON `service_order_item_commercial_versions`');
    await queryRunner.query('ALTER TABLE `service_order_item_commercial_versions` DROP COLUMN `issued_at`');
  }
}
