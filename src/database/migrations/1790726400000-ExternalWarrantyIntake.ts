import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExternalWarrantyIntake1790726400000 implements MigrationInterface {
  name = 'ExternalWarrantyIntake1790726400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE warranty_coverages
        ADD registration_origin ENUM('INTERNAL','EXTERNAL') NOT NULL DEFAULT 'INTERNAL',
        ADD responsibility ENUM('STORE','SUPPLIER','MANUFACTURER') NOT NULL DEFAULT 'STORE',
        ADD external_document_type VARCHAR(20) NULL,
        ADD external_document_series VARCHAR(20) NULL,
        ADD external_document_number VARCHAR(30) NULL,
        ADD external_document_date DATE NULL,
        ADD external_product_code VARCHAR(100) NULL,
        ADD external_evidence_reference VARCHAR(500) NULL,
        ADD verified_by INT NULL,
        ADD verified_at DATETIME NULL,
        ADD INDEX IDX_warranty_external_document (external_document_type, external_document_series, external_document_number),
        ADD CONSTRAINT FK_warranty_coverage_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(
      'ALTER TABLE service_order_items ADD received_condition TEXT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE dispatch_requests DROP FOREIGN KEY FK_dispatch_request_product',
    );
    await queryRunner.query(`
      ALTER TABLE dispatch_requests
        MODIFY product_id INT NULL,
        ADD fulfillment_source ENUM('INTERNAL','EXTERNAL') NOT NULL DEFAULT 'INTERNAL' AFTER product_id,
        ADD requested_product_name_snapshot VARCHAR(255) NULL,
        ADD requested_product_code_snapshot VARCHAR(100) NULL,
        ADD original_serial_snapshot VARCHAR(100) NULL AFTER original_serial_id,
        ADD replacement_product_name VARCHAR(255) NULL,
        ADD replacement_product_code VARCHAR(100) NULL,
        ADD replacement_brand VARCHAR(100) NULL,
        ADD replacement_model VARCHAR(150) NULL,
        ADD replacement_serial_code VARCHAR(100) NULL,
        ADD external_reference VARCHAR(200) NULL,
        ADD external_fulfilled_at DATETIME NULL,
        ADD CONSTRAINT FK_dispatch_request_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DELETE FROM dispatch_requests WHERE fulfillment_source = 'EXTERNAL'",
    );
    await queryRunner.query(
      'ALTER TABLE dispatch_requests DROP FOREIGN KEY FK_dispatch_request_product',
    );
    await queryRunner.query(`
      ALTER TABLE dispatch_requests
        DROP COLUMN external_fulfilled_at,
        DROP COLUMN external_reference,
        DROP COLUMN replacement_serial_code,
        DROP COLUMN replacement_model,
        DROP COLUMN replacement_brand,
        DROP COLUMN replacement_product_code,
        DROP COLUMN replacement_product_name,
        DROP COLUMN original_serial_snapshot,
        DROP COLUMN requested_product_code_snapshot,
        DROP COLUMN requested_product_name_snapshot,
        DROP COLUMN fulfillment_source,
        MODIFY product_id INT NOT NULL,
        ADD CONSTRAINT FK_dispatch_request_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(
      'ALTER TABLE service_order_items DROP COLUMN received_condition',
    );
    await queryRunner.query(
      'ALTER TABLE warranty_coverages DROP FOREIGN KEY FK_warranty_coverage_verified_by',
    );
    await queryRunner.query(
      'ALTER TABLE warranty_coverages DROP INDEX IDX_warranty_external_document',
    );
    await queryRunner.query(`
      ALTER TABLE warranty_coverages
        DROP COLUMN verified_at,
        DROP COLUMN verified_by,
        DROP COLUMN external_evidence_reference,
        DROP COLUMN external_product_code,
        DROP COLUMN external_document_date,
        DROP COLUMN external_document_number,
        DROP COLUMN external_document_series,
        DROP COLUMN external_document_type,
        DROP COLUMN responsibility,
        DROP COLUMN registration_origin
    `);
  }
}
