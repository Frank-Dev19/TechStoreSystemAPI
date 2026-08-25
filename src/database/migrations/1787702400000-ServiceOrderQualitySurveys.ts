import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderQualitySurveys1787702400000 implements MigrationInterface {
  name = 'ServiceOrderQualitySurveys1787702400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `service_order_surveys` (`id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, `service_order_id` bigint UNSIGNED NOT NULL, `expires_at` datetime(6) NOT NULL, `submitted_at` datetime(6) NULL, `overall_rating` tinyint UNSIGNED NULL, `attention_rating` tinyint UNSIGNED NULL, `service_quality_rating` tinyint UNSIGNED NULL, `comment` varchar(1000) NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_service_order_surveys_order` (`service_order_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_surveys` ADD CONSTRAINT `FK_service_order_surveys_order` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service_order_surveys` DROP FOREIGN KEY `FK_service_order_surveys_order`',
    );
    await queryRunner.query('DROP TABLE `service_order_surveys`');
  }
}
