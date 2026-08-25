import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationDeliveryRetries1787788800000 implements MigrationInterface {
  name = 'NotificationDeliveryRetries1787788800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_notification_messages` ADD `attempt_count` int unsigned NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_notification_messages` ADD `next_attempt_at` datetime NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_notification_messages` ADD `last_error` text NULL',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_service_order_notification_retry` ON `service_order_notification_messages` (`status`, `next_attempt_at`)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_service_order_notification_retry` ON `service_order_notification_messages`');
    await queryRunner.query('ALTER TABLE `service_order_notification_messages` DROP COLUMN `last_error`');
    await queryRunner.query('ALTER TABLE `service_order_notification_messages` DROP COLUMN `next_attempt_at`');
    await queryRunner.query('ALTER TABLE `service_order_notification_messages` DROP COLUMN `attempt_count`');
  }
}
