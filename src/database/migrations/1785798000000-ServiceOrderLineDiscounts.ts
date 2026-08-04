import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderLineDiscounts1785798000000 implements MigrationInterface {
  name = 'ServiceOrderLineDiscounts1785798000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`service_order_line_discounts\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`commercial_line_id\` bigint UNSIGNED NOT NULL,
        \`pricing_config_id\` int NULL,
        \`rule_name\` varchar(160) NOT NULL,
        \`type\` enum ('PERCENTAGE') NOT NULL DEFAULT 'PERCENTAGE',
        \`percentage\` decimal(8,4) NOT NULL,
        \`amount\` decimal(12,2) NOT NULL,
        \`max_allowed_pct\` decimal(8,4) NOT NULL,
        \`was_limit_overridden\` tinyint NOT NULL DEFAULT 0,
        \`override_reason\` varchar(500) NULL,
        \`applied_by_user_id\` int NOT NULL,
        \`authorized_by_user_id\` int NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_service_order_line_discount_line\` (\`commercial_line_id\`),
        INDEX \`IDX_service_order_line_discount_config\` (\`pricing_config_id\`),
        INDEX \`IDX_service_order_line_discount_applier\` (\`applied_by_user_id\`),
        INDEX \`IDX_service_order_line_discount_authorizer\` (\`authorized_by_user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_service_order_line_discount_line\` FOREIGN KEY (\`commercial_line_id\`) REFERENCES \`service_order_item_commercial_lines\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_service_order_line_discount_config\` FOREIGN KEY (\`pricing_config_id\`) REFERENCES \`pricing_configs\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_service_order_line_discount_applier\` FOREIGN KEY (\`applied_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_service_order_line_discount_authorizer\` FOREIGN KEY (\`authorized_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `service_order_line_discounts`');
  }
}
