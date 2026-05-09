import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRediagnosisAgreementVersioning20260506090000 implements MigrationInterface {
  name = 'AddRediagnosisAgreementVersioning20260506090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'service_order_agreements',
      'derived_from_agreement_id',
      'BIGINT UNSIGNED NULL AFTER diagnosis_id',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'service_order_agreement_products',
      'provenance',
      "ENUM('NEW','INHERITED') NOT NULL DEFAULT 'NEW' AFTER notes",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'service_order_agreement_products',
      'derived_from_agreement_product_item_id',
      'BIGINT UNSIGNED NULL AFTER provenance',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'service_order_agreement_services',
      'provenance',
      "ENUM('NEW','INHERITED') NOT NULL DEFAULT 'NEW' AFTER notes",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'service_order_agreement_services',
      'derived_from_agreement_service_item_id',
      'BIGINT UNSIGNED NULL AFTER provenance',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(queryRunner, 'service_order_agreement_services', 'derived_from_agreement_service_item_id');
    await this.dropColumnIfExists(queryRunner, 'service_order_agreement_services', 'provenance');
    await this.dropColumnIfExists(queryRunner, 'service_order_agreement_products', 'derived_from_agreement_product_item_id');
    await this.dropColumnIfExists(queryRunner, 'service_order_agreement_products', 'provenance');
    await this.dropColumnIfExists(queryRunner, 'service_order_agreements', 'derived_from_agreement_id');
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    definition: string,
  ) {
    const exists = await this.columnExists(queryRunner, tableName, columnName);
    if (exists) return;
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }

  private async dropColumnIfExists(queryRunner: QueryRunner, tableName: string, columnName: string) {
    const exists = await this.columnExists(queryRunner, tableName, columnName);
    if (!exists) return;
    await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName};`);
  }

  private async columnExists(queryRunner: QueryRunner, tableName: string, columnName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `
        SELECT 1 AS found
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1;
      `,
      [tableName, columnName],
    );

    return rows.length > 0;
  }
}
