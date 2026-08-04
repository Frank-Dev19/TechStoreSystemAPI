import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiEquipmentServiceOrderFoundation1785790800000 implements MigrationInterface {
  name = 'MultiEquipmentServiceOrderFoundation1785790800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    this.assertResetAuthorized();

    await queryRunner.query('DELETE FROM `service_order_inbox_message_order_links`');
    await queryRunner.query('DELETE FROM `service_order_inbox_thread_order_links`');
    await queryRunner.query('DELETE FROM `service_order_sale_links`');
    await queryRunner.query('DELETE FROM `service_order_notification_delivery_attempts`');
    await queryRunner.query('DELETE FROM `service_order_notification_messages`');
    await queryRunner.query('DELETE FROM `service_order_agreement_products`');
    await queryRunner.query('DELETE FROM `service_order_agreement_services`');
    await queryRunner.query('DELETE FROM `service_order_agreements`');
    await queryRunner.query('DELETE FROM `service_order_diagnoses`');
    await queryRunner.query('DELETE FROM `service_order_events`');
    await queryRunner.query('DELETE FROM `service_orders`');
    await queryRunner.query('DELETE FROM `service_order_temp_documents`');
    await queryRunner.query(
      'UPDATE `technician_assignment_balances` SET `assigned_count` = 0, `active_count` = 0, `last_assigned_at` = NULL',
    );

    await queryRunner.query(
      `CREATE TABLE \`service_order_daily_sequences\` (
        \`business_date\` date NOT NULL,
        \`last_value\` int UNSIGNED NOT NULL DEFAULT 0,
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`business_date\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_items\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`service_order_id\` bigint UNSIGNED NOT NULL,
        \`position\` tinyint UNSIGNED NOT NULL,
        \`code\` varchar(54) NOT NULL,
        \`equipment_type\` enum ('LAPTOP','DESKTOP_PC','ALL_IN_ONE','PRINTER','SCANNER','PROJECTOR','MONITOR','SERVER','NETWORK_DEVICE','OTHER') NOT NULL,
        \`equipment_type_other\` varchar(120) NULL,
        \`brand\` varchar(100) NULL,
        \`model\` varchar(150) NULL,
        \`serial_number\` varchar(100) NULL,
        \`serial_number_normalized\` varchar(100) NULL,
        \`accessories\` text NULL,
        \`initial_issue\` text NOT NULL,
        \`notes\` text NULL,
        \`priority\` enum ('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'LOW',
        \`operative_status\` enum ('ABIERTA','EN_PROCESO','LISTA_PARA_ENTREGA','ENTREGADA','CANCELADA','CERRADA_SIN_SOLUCION') NOT NULL,
        \`technical_status\` enum ('PENDIENTE_ASIGNACION','ASIGNADA','EN_DIAGNOSTICO','DIAGNOSTICADA','PENDIENTE_DEFINICION_COMERCIAL','AUTORIZADA_PARA_EJECUCION','EN_EJECUCION','BLOQUEADA','ESPERANDO_REPUESTOS_O_TERCERO','RESUELTA','SIN_SOLUCION') NOT NULL,
        \`commercial_status\` enum ('NO_REQUIERE','PENDIENTE_PROPUESTA','PROPUESTA_EMITIDA','PENDIENTE_RESPUESTA_CLIENTE','AUTORIZADA','RECHAZADA','EXPIRADA','REEMPLAZADA') NOT NULL,
        \`estimated_repair_hours\` decimal(5,2) NULL,
        \`estimated_delivery_date\` datetime NULL,
        \`review_started_at\` datetime NULL,
        \`service_started_at\` datetime NULL,
        \`service_completed_at\` datetime NULL,
        \`ready_for_pickup_at\` datetime NULL,
        \`resolved_at\` datetime NULL,
        \`delivered_at\` datetime NULL,
        \`cancelled_at\` datetime NULL,
        \`cancellation_reason\` text NULL,
        \`warranty_source_item_id\` bigint UNSIGNED NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` datetime(6) NULL,
        UNIQUE INDEX \`UQ_service_order_item_code\` (\`code\`),
        UNIQUE INDEX \`UQ_service_order_item_position\` (\`service_order_id\`, \`position\`),
        INDEX \`IDX_service_order_item_serial_normalized\` (\`serial_number_normalized\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_service_order_item_order\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_service_order_item_warranty_source\` FOREIGN KEY (\`warranty_source_item_id\`) REFERENCES \`service_order_items\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_diagnoses` DROP FOREIGN KEY `FK_ebc0fdb58bf8ddceedeb3e529f6`',
    );
    await queryRunner.query('ALTER TABLE `service_order_diagnoses` DROP COLUMN `service_order_id`');
    await queryRunner.query(
      'ALTER TABLE `service_order_diagnoses` ADD `service_order_item_id` bigint UNSIGNED NOT NULL AFTER `id`',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_diagnoses` ADD CONSTRAINT `FK_service_order_diagnosis_item` FOREIGN KEY (`service_order_item_id`) REFERENCES `service_order_items`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_item_commercial_versions\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`service_order_item_id\` bigint UNSIGNED NOT NULL,
        \`derived_from_version_id\` bigint UNSIGNED NULL,
        \`version_number\` int UNSIGNED NOT NULL,
        \`status\` enum ('DRAFT','ISSUED','ACCEPTED','REPLACED','VOIDED') NOT NULL,
        \`total_amount\` decimal(12,2) NOT NULL,
        \`notes\` text NULL,
        \`created_by_user_id\` bigint UNSIGNED NOT NULL,
        \`accepted_at\` datetime NULL,
        \`accepted_by_user_id\` bigint UNSIGNED NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_service_order_item_commercial_version\` (\`service_order_item_id\`, \`version_number\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_item_commercial_version_item\` FOREIGN KEY (\`service_order_item_id\`) REFERENCES \`service_order_items\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_item_commercial_version_parent\` FOREIGN KEY (\`derived_from_version_id\`) REFERENCES \`service_order_item_commercial_versions\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_item_commercial_lines\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`commercial_version_id\` bigint UNSIGNED NOT NULL,
        \`type\` enum ('PRODUCT','SERVICE','ADJUSTMENT') NOT NULL,
        \`product_id\` int NULL,
        \`service_id\` int UNSIGNED NULL,
        \`catalog_code_snapshot\` varchar(100) NOT NULL,
        \`catalog_name_snapshot\` varchar(180) NOT NULL,
        \`catalog_description_snapshot\` text NULL,
        \`quantity\` decimal(10,2) NOT NULL,
        \`unit_price\` decimal(12,2) NOT NULL,
        \`gross_amount\` decimal(12,2) NOT NULL,
        \`discount_amount\` decimal(12,2) NOT NULL DEFAULT 0,
        \`net_amount\` decimal(12,2) NOT NULL,
        \`requires_purchase\` tinyint(1) NOT NULL DEFAULT 0,
        \`notes\` text NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_item_commercial_line_version\` FOREIGN KEY (\`commercial_version_id\`) REFERENCES \`service_order_item_commercial_versions\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_item_commercial_line_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_agreement_items\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`service_order_agreement_id\` bigint UNSIGNED NOT NULL,
        \`service_order_item_id\` bigint UNSIGNED NOT NULL,
        \`commercial_version_id\` bigint UNSIGNED NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_service_order_agreement_item\` (\`service_order_agreement_id\`, \`service_order_item_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_agreement_item_agreement\` FOREIGN KEY (\`service_order_agreement_id\`) REFERENCES \`service_order_agreements\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_agreement_item_order_item\` FOREIGN KEY (\`service_order_item_id\`) REFERENCES \`service_order_items\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_agreement_item_version\` FOREIGN KEY (\`commercial_version_id\`) REFERENCES \`service_order_item_commercial_versions\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    this.assertResetAuthorized();
    await queryRunner.query('DROP TABLE `service_order_agreement_items`');
    await queryRunner.query('DROP TABLE `service_order_item_commercial_lines`');
    await queryRunner.query('DROP TABLE `service_order_item_commercial_versions`');
    await queryRunner.query('DELETE FROM `service_order_diagnoses`');
    await queryRunner.query(
      'ALTER TABLE `service_order_diagnoses` DROP FOREIGN KEY `FK_service_order_diagnosis_item`',
    );
    await queryRunner.query('ALTER TABLE `service_order_diagnoses` DROP COLUMN `service_order_item_id`');
    await queryRunner.query(
      'ALTER TABLE `service_order_diagnoses` ADD `service_order_id` bigint UNSIGNED NOT NULL AFTER `id`',
    );
    await queryRunner.query(
      'ALTER TABLE `service_order_diagnoses` ADD CONSTRAINT `FK_ebc0fdb58bf8ddceedeb3e529f6` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query('DROP TABLE `service_order_items`');
    await queryRunner.query('DROP TABLE `service_order_daily_sequences`');
  }

  private assertResetAuthorized(): void {
    if (process.env.ALLOW_SERVICE_ORDER_DATA_RESET !== 'true') {
      throw new Error(
        'Migration aborted: set ALLOW_SERVICE_ORDER_DATA_RESET=true only after verifying a database backup',
      );
    }
  }
}
