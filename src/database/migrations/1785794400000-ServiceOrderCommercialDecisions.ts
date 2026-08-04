import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderCommercialDecisions1785794400000 implements MigrationInterface {
  name = 'ServiceOrderCommercialDecisions1785794400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`service_order_client_decisions\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`commercial_version_id\` bigint UNSIGNED NOT NULL,
        \`decision\` enum ('ACCEPTED','CHANGES_REQUESTED') NOT NULL,
        \`channel\` enum ('WHATSAPP','PHONE','IN_PERSON','EMAIL','OTHER') NOT NULL,
        \`observation\` text NULL,
        \`recorded_by_user_id\` int NOT NULL,
        \`recorded_at\` datetime NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_service_order_client_decision_version\` (\`commercial_version_id\`),
        INDEX \`IDX_service_order_client_decision_recorder\` (\`recorded_by_user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_client_decision_version\` FOREIGN KEY (\`commercial_version_id\`) REFERENCES \`service_order_item_commercial_versions\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_client_decision_recorder\` FOREIGN KEY (\`recorded_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `service_order_client_decisions`');
  }
}
