import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class InternalWarrantyCoverage1787961600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('products', 'warranty_duration_value'))) {
      await queryRunner.addColumns('products', [
        new TableColumn({ name: 'warranty_duration_value', type: 'int', unsigned: true, default: 0 }),
        new TableColumn({
          name: 'warranty_duration_unit',
          type: 'enum',
          enum: ['DAY', 'MONTH', 'YEAR'],
          default: "'DAY'",
        }),
      ]);
    }

    if (!(await queryRunner.hasColumn('service_order_item_commercial_versions', 'warranty_duration_value'))) {
      await queryRunner.addColumns('service_order_item_commercial_versions', [
        new TableColumn({ name: 'warranty_duration_value', type: 'int', unsigned: true, default: 30 }),
        new TableColumn({
          name: 'warranty_duration_unit',
          type: 'enum',
          enum: ['DAY', 'MONTH', 'YEAR'],
          default: "'DAY'",
        }),
      ]);
    }

    if (!(await queryRunner.hasTable('warranty_coverages'))) {
      await queryRunner.query(`
        CREATE TABLE warranty_coverages (
          id bigint UNSIGNED NOT NULL AUTO_INCREMENT,
          source_type enum('PRODUCT','SERVICE') NOT NULL,
          source_unit_key varchar(100) NOT NULL,
          company_id int NULL,
          customer_id bigint UNSIGNED NOT NULL,
          sale_id int NULL,
          sale_item_id int NULL,
          service_order_id bigint UNSIGNED NULL,
          service_order_item_id bigint UNSIGNED NULL,
          product_id int NULL,
          serial_id int NULL,
          source_code_snapshot varchar(120) NOT NULL,
          source_name_snapshot varchar(255) NOT NULL,
          serial_snapshot varchar(120) NULL,
          origin_technician_id int NULL,
          origin_technician_name_snapshot varchar(150) NULL,
          duration_value int UNSIGNED NOT NULL,
          duration_unit enum('DAY','MONTH','YEAR') NOT NULL,
          starts_at datetime NOT NULL,
          expires_at datetime NOT NULL,
          coverage_amount decimal(10,2) NOT NULL,
          status enum('ACTIVE','RESERVED','CONSUMED','EXPIRED','REVOKED') NOT NULL DEFAULT 'ACTIVE',
          consumed_at datetime NULL,
          revoked_at datetime NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY UQ_warranty_coverage_source_unit (source_type, source_unit_key),
          KEY IDX_warranty_coverage_customer_status (customer_id, status),
          KEY IDX_warranty_coverage_sale (sale_id),
          KEY IDX_warranty_coverage_service_item (service_order_item_id),
          CONSTRAINT FK_warranty_coverage_customer FOREIGN KEY (customer_id) REFERENCES clients(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_service_order FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_service_item FOREIGN KEY (service_order_item_id) REFERENCES service_order_items(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_serial FOREIGN KEY (serial_id) REFERENCES serials(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_coverage_origin_technician FOREIGN KEY (origin_technician_id) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasTable('warranty_claims'))) {
      await queryRunner.query(`
        CREATE TABLE warranty_claims (
          id bigint UNSIGNED NOT NULL AUTO_INCREMENT,
          coverage_id bigint UNSIGNED NOT NULL,
          status enum('RECEIVED','IN_REVIEW','RESOLVED_APPLIES','RESOLVED_REJECTED','CANCELLED') NOT NULL DEFAULT 'RECEIVED',
          service_order_id bigint UNSIGNED NULL,
          service_order_item_id bigint UNSIGNED NULL,
          diagnosis_id bigint UNSIGNED NULL,
          outcome enum('REPAIRABLE','IRREPARABLE','NOT_COST_EFFECTIVE','NO_PARTS_AVAILABLE','NO_FAULT_FOUND','WARRANTY_APPLIES','WARRANTY_REJECTED') NULL,
          origin_technician_id int NULL,
          attending_technician_id int NULL,
          technician_override_reason text NULL,
          reported_issue text NOT NULL,
          reserved_at datetime NOT NULL,
          review_started_at datetime NULL,
          resolved_at datetime NULL,
          cancelled_at datetime NULL,
          cancelled_by int NULL,
          cancellation_reason text NULL,
          created_by int NOT NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY IDX_warranty_claim_coverage_status (coverage_id, status),
          KEY IDX_warranty_claim_service_order (service_order_id),
          CONSTRAINT FK_warranty_claim_coverage FOREIGN KEY (coverage_id) REFERENCES warranty_coverages(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_claim_service_order FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE SET NULL,
          CONSTRAINT FK_warranty_claim_service_item FOREIGN KEY (service_order_item_id) REFERENCES service_order_items(id) ON DELETE SET NULL,
          CONSTRAINT FK_warranty_claim_diagnosis FOREIGN KEY (diagnosis_id) REFERENCES service_order_diagnoses(id) ON DELETE SET NULL,
          CONSTRAINT FK_warranty_claim_origin_technician FOREIGN KEY (origin_technician_id) REFERENCES users(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_claim_attending_technician FOREIGN KEY (attending_technician_id) REFERENCES users(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_claim_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_claim_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasTable('warranty_movements'))) {
      await queryRunner.query(`
        CREATE TABLE warranty_movements (
          id bigint UNSIGNED NOT NULL AUTO_INCREMENT,
          coverage_id bigint UNSIGNED NOT NULL,
          claim_id bigint UNSIGNED NULL,
          type enum('ISSUED','RESERVED','RELEASED','CONSUMED','EXPIRED','REVOKED','TECHNICIAN_OVERRIDDEN') NOT NULL,
          amount decimal(10,2) NOT NULL,
          actor_id int NULL,
          actor_name_snapshot varchar(150) NULL,
          reason text NULL,
          metadata_json json NULL,
          created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY IDX_warranty_movement_coverage (coverage_id),
          CONSTRAINT FK_warranty_movement_coverage FOREIGN KEY (coverage_id) REFERENCES warranty_coverages(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_movement_claim FOREIGN KEY (claim_id) REFERENCES warranty_claims(id) ON DELETE RESTRICT,
          CONSTRAINT FK_warranty_movement_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasColumn('service_orders', 'warranty_claim_id'))) {
      await queryRunner.query(`
        ALTER TABLE service_orders
          ADD COLUMN warranty_claim_id bigint UNSIGNED NULL,
          ADD UNIQUE KEY UQ_service_order_warranty_claim (warranty_claim_id),
          ADD CONSTRAINT FK_service_order_warranty_claim
            FOREIGN KEY (warranty_claim_id) REFERENCES warranty_claims(id) ON DELETE SET NULL
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('service_orders', 'warranty_claim_id')) {
      await queryRunner.query('ALTER TABLE service_orders DROP FOREIGN KEY FK_service_order_warranty_claim');
      await queryRunner.dropColumn('service_orders', 'warranty_claim_id');
    }
    if (await queryRunner.hasTable('warranty_movements')) await queryRunner.dropTable('warranty_movements');
    if (await queryRunner.hasTable('warranty_claims')) await queryRunner.dropTable('warranty_claims');
    if (await queryRunner.hasTable('warranty_coverages')) await queryRunner.dropTable('warranty_coverages');
    if (await queryRunner.hasColumn('service_order_item_commercial_versions', 'warranty_duration_unit')) {
      await queryRunner.dropColumn('service_order_item_commercial_versions', 'warranty_duration_unit');
      await queryRunner.dropColumn('service_order_item_commercial_versions', 'warranty_duration_value');
    }
    if (await queryRunner.hasColumn('products', 'warranty_duration_unit')) {
      await queryRunner.dropColumn('products', 'warranty_duration_unit');
      await queryRunner.dropColumn('products', 'warranty_duration_value');
    }
  }
}
