import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacyServiceCatalog20260423030000 implements MigrationInterface {
  name = 'RemoveLegacyServiceCatalog20260423030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropForeignKeysByColumn(queryRunner, 'service_order_agreement_services', 'service_id');
    await this.dropForeignKeysByColumn(queryRunner, 'sale_items', 'service_id');

    await this.nullLegacyServiceReference(queryRunner, 'service_order_agreement_services', 'service_id');
    await this.nullLegacyServiceReference(queryRunner, 'sale_items', 'service_id');

    await queryRunner.query('DROP TABLE IF EXISTS services;');
    await queryRunner.query('DROP TABLE IF EXISTS service_categories;');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_service_categories_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS services (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        category_id INT UNSIGNED NOT NULL,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(256) NOT NULL,
        description TEXT NULL,
        estimated_duration_minutes INT UNSIGNED NOT NULL DEFAULT 60,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        warranty_days INT UNSIGNED NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_services_code (code),
        KEY idx_services_category_id (category_id),
        CONSTRAINT fk_services_category_id
          FOREIGN KEY (category_id) REFERENCES service_categories(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const agreementColumnExists = await this.columnExists(queryRunner, 'service_order_agreement_services', 'service_id');
    if (agreementColumnExists) {
      await queryRunner.query(`
        ALTER TABLE service_order_agreement_services
        ADD CONSTRAINT fk_service_order_agreement_services_service_id
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
      `).catch(() => undefined);
    }

    const saleItemColumnExists = await this.columnExists(queryRunner, 'sale_items', 'service_id');
    if (saleItemColumnExists) {
      await queryRunner.query(`
        ALTER TABLE sale_items
        ADD CONSTRAINT fk_sale_items_service_id
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
      `).catch(() => undefined);
    }
  }

  private async dropForeignKeysByColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const foreignKeys = await queryRunner.query(
      `
        SELECT CONSTRAINT_NAME AS constraintName
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL;
      `,
      [tableName, columnName],
    );

    for (const fk of foreignKeys as Array<{ constraintName: string }>) {
      await queryRunner.query(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${fk.constraintName};`);
    }
  }

  private async nullLegacyServiceReference(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const exists = await this.columnExists(queryRunner, tableName, columnName);
    if (!exists) return;
    await queryRunner.query(`UPDATE ${tableName} SET ${columnName} = NULL WHERE ${columnName} IS NOT NULL;`);
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
