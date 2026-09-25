import { MigrationInterface, QueryRunner } from 'typeorm';

export class WarehouseDispatchManagement1789776000000 implements MigrationInterface {
  name = 'WarehouseDispatchManagement1789776000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE dispatch_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        type ENUM('INTERNAL_SUPPLY','WARRANTY_REPLACEMENT') NOT NULL,
        status ENUM('PENDING','DELIVERED','CONFIRMED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        technician_id INT NOT NULL,
        requested_by INT NOT NULL,
        product_id INT NOT NULL,
        quantity DECIMAL(14,4) NOT NULL,
        reason TEXT NOT NULL,
        service_order_id BIGINT UNSIGNED NULL,
        service_order_item_id BIGINT UNSIGNED NULL,
        warranty_claim_id BIGINT UNSIGNED NULL,
        original_serial_id INT NULL,
        original_unit_condition VARCHAR(20) NULL,
        delivery_id INT NULL,
        resolved_by INT NULL,
        resolution_note TEXT NULL,
        delivered_at DATETIME NULL,
        confirmed_at DATETIME NULL,
        rejected_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_dispatch_request_warranty_claim (warranty_claim_id),
        KEY IDX_dispatch_request_queue (type, status, created_at),
        KEY IDX_dispatch_request_technician (technician_id),
        KEY IDX_dispatch_request_product (product_id),
        CONSTRAINT FK_dispatch_request_technician FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dispatch_request_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dispatch_request_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dispatch_request_order FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dispatch_request_item FOREIGN KEY (service_order_item_id) REFERENCES service_order_items(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dispatch_request_claim FOREIGN KEY (warranty_claim_id) REFERENCES warranty_claims(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dispatch_request_original_serial FOREIGN KEY (original_serial_id) REFERENCES serials(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(
      "ALTER TABLE material_deliveries MODIFY type ENUM('ORDER','MANUAL','INTERNAL_REQUEST','WARRANTY_REPLACEMENT') NOT NULL DEFAULT 'ORDER'",
    );
    await queryRunner.query(
      'ALTER TABLE material_deliveries ADD dispatchRequestId BIGINT UNSIGNED NULL, ADD INDEX IDX_material_delivery_dispatch_request (dispatchRequestId), ADD CONSTRAINT FK_material_delivery_dispatch_request FOREIGN KEY (dispatchRequestId) REFERENCES dispatch_requests(id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      "ALTER TABLE service_order_diagnoses ADD warranty_resolution_type ENUM('CONFIGURATION','REPAIR','FACTORY_REPLACEMENT') NULL",
    );
    await queryRunner.query(
      "ALTER TABLE warranty_claims MODIFY status ENUM('RECEIVED','IN_REVIEW','WAITING_REPLACEMENT','REPLACEMENT_DELIVERED','RESOLVED_REPLACED','RESOLVED_APPLIES','RESOLVED_REJECTED','CANCELLED') NOT NULL DEFAULT 'RECEIVED'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE warranty_claims SET status = 'RESOLVED_APPLIES' WHERE status IN ('WAITING_REPLACEMENT','REPLACEMENT_DELIVERED','RESOLVED_REPLACED')",
    );
    await queryRunner.query(
      "ALTER TABLE warranty_claims MODIFY status ENUM('RECEIVED','IN_REVIEW','RESOLVED_APPLIES','RESOLVED_REJECTED','CANCELLED') NOT NULL DEFAULT 'RECEIVED'",
    );
    await queryRunner.query('ALTER TABLE service_order_diagnoses DROP COLUMN warranty_resolution_type');
    await queryRunner.query('ALTER TABLE material_deliveries DROP FOREIGN KEY FK_material_delivery_dispatch_request');
    await queryRunner.query('ALTER TABLE material_deliveries DROP INDEX IDX_material_delivery_dispatch_request');
    await queryRunner.query('ALTER TABLE material_deliveries DROP COLUMN dispatchRequestId');
    await queryRunner.query("ALTER TABLE material_deliveries MODIFY type ENUM('ORDER','MANUAL') NOT NULL DEFAULT 'ORDER'");
    await queryRunner.query('DROP TABLE dispatch_requests');
  }
}
