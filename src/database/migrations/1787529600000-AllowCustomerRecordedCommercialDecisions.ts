import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowCustomerRecordedCommercialDecisions1787529600000
  implements MigrationInterface
{
  name = 'AllowCustomerRecordedCommercialDecisions1787529600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_client_decisions` DROP FOREIGN KEY `FK_client_decision_recorder`',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_client_decisions` MODIFY `recorded_by_user_id` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_client_decisions` ADD CONSTRAINT `FK_client_decision_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_client_decisions` DROP FOREIGN KEY `FK_client_decision_recorder`',
    );
    await queryRunner.query(
      'UPDATE `service_order_client_decisions` SET `recorded_by_user_id` = (SELECT `id` FROM `users` ORDER BY `id` ASC LIMIT 1) WHERE `recorded_by_user_id` IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_client_decisions` MODIFY `recorded_by_user_id` int NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_client_decisions` ADD CONSTRAINT `FK_client_decision_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }
}
