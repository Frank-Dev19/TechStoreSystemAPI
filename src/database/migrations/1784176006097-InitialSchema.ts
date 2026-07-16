import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1784176006097 implements MigrationInterface {
  name = 'InitialSchema1784176006097';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`permission_modules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`module_key\` varchar(64) NOT NULL, \`label\` varchar(100) NOT NULL, \`sortOrder\` int NOT NULL DEFAULT '0', \`icon\` varchar(64) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_permission_modules_module_key\` (\`module_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`permissions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`code\` varchar(255) NOT NULL, \`description\` varchar(255) NOT NULL, \`action_key\` varchar(64) NOT NULL, \`sort_order\` int NOT NULL DEFAULT '0', \`module_id\` int NOT NULL, UNIQUE INDEX \`IDX_8dad765629e83229da6feda1c1\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, UNIQUE INDEX \`IDX_648e3f5447f725579d7d4ffdfb\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`user_permissions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`effect\` enum ('allow', 'deny') NOT NULL, \`expiresAt\` datetime NULL, \`scope\` json NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` int NULL, \`permissionId\` int NULL, UNIQUE INDEX \`IDX_4d0e283b03781d1796e62dc619\` (\`userId\`, \`permissionId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`document_types\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`name\` varchar(50) NOT NULL, \`digits\` int NOT NULL, \`description\` varchar(255) NOT NULL, \`kind\` enum ('PERSON', 'COMPANY') NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_803cd247b7c1c8d91b30a3eb21\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`name\` varchar(255) NOT NULL, \`phone\` varchar(30) NULL, \`documentNumber\` varchar(32) NULL, \`passwordHash\` varchar(255) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`document_type_id\` bigint UNSIGNED NOT NULL, UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), UNIQUE INDEX \`IDX_9919ce10860709c1f0f115062b\` (\`documentNumber\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`suppliers\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`company_id\` bigint UNSIGNED NOT NULL, \`name\` varchar(150) NOT NULL, \`trade_name\` varchar(150) NULL, \`document_type_id\` bigint UNSIGNED NOT NULL, \`document_number\` varchar(15) NOT NULL, \`email\` varchar(150) NULL, \`phone\` varchar(20) NULL, \`address\` varchar(255) NULL, \`city\` varchar(150) NULL, \`country\` varchar(150) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_fccf1e6f85418f6ce60938ab14\` (\`company_id\`, \`document_type_id\`, \`document_number\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sessions\` (\`id\` varchar(36) NOT NULL, \`tokenHash\` varchar(255) NOT NULL, \`expiresAt\` datetime NOT NULL, \`revokedAt\` datetime NULL, \`rotatedAt\` datetime NULL, \`rotatedFrom\` char(36) NULL, \`userAgent\` varchar(255) NULL, \`ip\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`technician_assignment_balances\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`technician_id\` int NOT NULL, \`service_type\` enum ('STANDARD_SERVICE', 'DIAGNOSIS', 'WARRANTY_SERVICE', 'ASSEMBLY', 'CUSTOMER_SERVICE') NOT NULL, \`assigned_count\` int UNSIGNED NOT NULL DEFAULT '0', \`active_count\` int UNSIGNED NOT NULL DEFAULT '0', \`last_assigned_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`uq_technician_assignment_balance\` (\`technician_id\`, \`service_type\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`client_contacts\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`client_id\` bigint UNSIGNED NOT NULL, \`name\` varchar(150) NOT NULL, \`email\` varchar(150) NULL, \`phone\` varchar(20) NULL, \`is_primary\` tinyint(1) NOT NULL DEFAULT 0, \`is_active\` tinyint(1) NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`clients\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`company_id\` bigint UNSIGNED NOT NULL, \`name\` varchar(150) NOT NULL, \`trade_name\` varchar(150) NULL, \`kind\` enum ('PERSON', 'COMPANY') NOT NULL DEFAULT 'PERSON', \`document_type_id\` bigint UNSIGNED NOT NULL, \`document_number\` varchar(15) NOT NULL, \`email\` varchar(150) NULL, \`phone\` varchar(20) NULL, \`address\` varchar(255) NULL, \`city\` varchar(150) NULL, \`country\` varchar(150) NULL, \`requires_contact_completion\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_e18b20723103a857857d78536e\` (\`company_id\`, \`document_type_id\`, \`document_number\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_orders\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`code\` varchar(50) NOT NULL, \`operative_status\` enum ('ABIERTA', 'EN_PROCESO', 'LISTA_PARA_ENTREGA', 'ENTREGADA', 'CANCELADA', 'CERRADA_SIN_SOLUCION') NOT NULL DEFAULT 'ABIERTA', \`technical_status\` enum ('PENDIENTE_ASIGNACION', 'ASIGNADA', 'EN_DIAGNOSTICO', 'DIAGNOSTICADA', 'PENDIENTE_DEFINICION_COMERCIAL', 'AUTORIZADA_PARA_EJECUCION', 'EN_EJECUCION', 'BLOQUEADA', 'ESPERANDO_REPUESTOS_O_TERCERO', 'RESUELTA', 'SIN_SOLUCION') NOT NULL DEFAULT 'PENDIENTE_ASIGNACION', \`commercial_status\` enum ('NO_REQUIERE', 'PENDIENTE_PROPUESTA', 'PROPUESTA_EMITIDA', 'PENDIENTE_RESPUESTA_CLIENTE', 'AUTORIZADA', 'RECHAZADA', 'EXPIRADA', 'REEMPLAZADA') NOT NULL DEFAULT 'NO_REQUIERE', \`economic_status\` enum ('NO_APLICA', 'PENDIENTE', 'PARCIAL', 'TOTAL', 'EXONERADO', 'REVERTIDO') NOT NULL DEFAULT 'NO_APLICA', \`priority\` enum ('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM', \`request_origin\` enum ('CLIENT', 'INTERNAL') NOT NULL DEFAULT 'CLIENT', \`equipment_type\` enum ('LAPTOP', 'DESKTOP_PC', 'ALL_IN_ONE', 'PRINTER', 'SCANNER', 'PROJECTOR', 'MONITOR', 'SERVER', 'NETWORK_DEVICE', 'OTHER') NOT NULL, \`equipment_type_other\` varchar(120) NULL, \`brand\` varchar(100) NULL, \`model\` varchar(150) NULL, \`serial_number\` varchar(100) NULL, \`accessories\` text NULL, \`service_type\` enum ('STANDARD_SERVICE', 'DIAGNOSIS', 'WARRANTY_SERVICE', 'ASSEMBLY', 'CUSTOMER_SERVICE') NOT NULL DEFAULT 'DIAGNOSIS', \`initial_issue\` text NOT NULL, \`estimated_repair_hours\` decimal(5,2) NULL, \`assigned_to_technician_id\` int NULL, \`assigned_at\` datetime NULL, \`client_id\` bigint UNSIGNED NULL, \`client_contact_id\` bigint UNSIGNED NULL, \`client_snapshot_name\` varchar(150) NULL, \`client_snapshot_document_type_name\` varchar(100) NULL, \`client_snapshot_document_number\` varchar(20) NULL, \`client_snapshot_phone\` varchar(20) NULL, \`client_snapshot_email\` varchar(150) NULL, \`created_by\` int NOT NULL, \`closed_by\` int NULL, \`cancelled_by\` int NULL, \`estimated_delivery_date\` datetime NULL, \`received_at\` datetime NOT NULL, \`review_started_at\` datetime NULL, \`service_started_at\` datetime NULL, \`service_completed_at\` datetime NULL, \`ready_for_pickup_at\` datetime NULL, \`resolved_at\` datetime NULL, \`delivered_at\` datetime NULL, \`closed_at\` datetime NULL, \`cancelled_at\` datetime NULL, \`notes\` text NULL, \`monto_comprometido_vigente\` decimal(10,2) NOT NULL DEFAULT '0.00', \`monto_reconciliado\` decimal(10,2) NOT NULL DEFAULT '0.00', \`discount\` decimal(10,2) NOT NULL DEFAULT '0.00', \`cancellation_reason\` text NULL, \`rating\` tinyint UNSIGNED NULL, \`rating_comment\` text NULL, \`rated_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_a55f4001e5983576c521eb7589\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`categories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(128) NOT NULL, \`description\` text NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`units\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(64) NOT NULL, \`abbreviation\` varchar(16) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`lots\` (\`id\` int NOT NULL AUTO_INCREMENT, \`productId\` int NOT NULL, \`lotCode\` varchar(64) NOT NULL, \`expirationDate\` date NULL, \`supplierId\` bigint UNSIGNED NULL, \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_05cfec1a482b2ba09642a9d7f5\` (\`productId\`, \`lotCode\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`serials\` (\`id\` int NOT NULL AUTO_INCREMENT, \`productId\` int NOT NULL, \`serialCode\` varchar(64) NOT NULL, \`lotId\` int NULL, \`supplierId\` bigint UNSIGNED NULL, \`status\` varchar(16) NOT NULL DEFAULT 'IN_STOCK', \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_c57c159e9d5cfa0ef389f58a7e\` (\`serialCode\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`stock\` (\`id\` int NOT NULL AUTO_INCREMENT, \`productId\` int NOT NULL, \`lotId\` int NULL, \`qtyOnHand\` decimal(14,4) NOT NULL DEFAULT '0.0000', \`avgUnitCost\` decimal(14,4) NOT NULL DEFAULT '0.0000', \`totalCost\` decimal(16,4) NOT NULL DEFAULT '0.0000', \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_495f9e1298489db58e5052db42\` (\`productId\`, \`lotId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`products\` (\`id\` int NOT NULL AUTO_INCREMENT, \`sku\` varchar(64) NOT NULL, \`name\` varchar(256) NOT NULL, \`description\` text NULL, \`brand\` varchar(128) NULL, \`categoryId\` int NOT NULL, \`baseUnitId\` int NOT NULL, \`isSerialized\` tinyint NOT NULL DEFAULT 0, \`managesExpiration\` tinyint NOT NULL DEFAULT 0, \`minStock\` int NOT NULL DEFAULT '0', \`maxStock\` int NOT NULL DEFAULT '0', \`reorderPoint\` int NOT NULL DEFAULT '0', UNIQUE INDEX \`IDX_c44ac33a05b144dd0d9ddcf932\` (\`sku\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sale_items\` (\`id\` int NOT NULL AUTO_INCREMENT, \`sale_id\` int NOT NULL, \`item_type\` varchar(16) NOT NULL DEFAULT 'PRODUCT', \`product_id\` int NULL, \`service_id\` int UNSIGNED NULL, \`service_code_snapshot\` varchar(64) NULL, \`service_name_snapshot\` varchar(256) NULL, \`description_snapshot\` varchar(256) NULL, \`lot_id\` int NULL, \`base_unit_price\` decimal(16,6) NOT NULL, \`final_unit_price\` decimal(16,6) NOT NULL, \`quantity\` decimal(14,4) NOT NULL, \`discount_amount\` decimal(16,6) NOT NULL DEFAULT '0.000000', \`tax_amount\` decimal(16,6) NOT NULL DEFAULT '0.000000', \`line_total\` decimal(16,6) NOT NULL, \`serial_count\` int NOT NULL DEFAULT '0', \`is_combo_item\` tinyint NOT NULL DEFAULT 0, \`combo_id\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sale_payments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`sale_id\` int NOT NULL, \`method\` varchar(20) NOT NULL, \`amount\` decimal(16,2) NOT NULL, \`exchange_rate\` decimal(10,4) NOT NULL DEFAULT '1.0000', \`currency\` varchar(3) NOT NULL DEFAULT 'PEN', \`payment_date\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, \`reference\` varchar(100) NULL, \`bank_name\` varchar(100) NULL, \`card_type\` varchar(50) NULL, \`observations\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sale_line_discounts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`sale_id\` int NOT NULL, \`sale_item_id\` int NULL, \`discount_rule_id\` int UNSIGNED NULL, \`discount_source\` varchar(16) NOT NULL, \`name\` varchar(128) NOT NULL, \`amount\` decimal(10,4) NOT NULL, \`is_percent\` tinyint NOT NULL, \`discount_value\` decimal(16,6) NOT NULL, \`priority\` int NOT NULL DEFAULT '0', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sale_combo_items\` (\`id\` int NOT NULL AUTO_INCREMENT, \`sale_id\` int NOT NULL, \`sale_item_id\` int NULL, \`combo_id\` int NULL, \`product_id\` int NOT NULL, \`qty_in_combo\` decimal(14,4) NOT NULL, \`unit_price_at_sale\` decimal(16,6) NOT NULL, \`combo_savings\` decimal(16,6) NOT NULL DEFAULT '0.000000', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`document_series\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`document_type\` varchar(16) NOT NULL, \`code\` varchar(10) NOT NULL, \`name\` varchar(100) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`current_number\` int NOT NULL DEFAULT '1', \`starting_number\` int NOT NULL DEFAULT '1', \`created_by\` varchar(100) NULL, \`updated_by\` varchar(100) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_6616aa67d31d741f6ed06d6d1f\` (\`company_id\`, \`document_type\`, \`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`cash_flow_transactions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`cash_register_id\` int NULL, \`sale_id\` int NULL, \`type\` varchar(16) NOT NULL, \`subtype\` varchar(16) NULL, \`description\` varchar(255) NOT NULL, \`amount\` decimal(16,2) NOT NULL, \`balance_after\` decimal(16,2) NOT NULL, \`currency\` varchar(3) NOT NULL DEFAULT 'PEN', \`exchange_rate\` decimal(10,4) NOT NULL DEFAULT '1.0000', \`reference\` varchar(100) NULL, \`recorded_by\` varchar(100) NOT NULL, \`recorded_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`cash_registers\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`code\` varchar(32) NOT NULL, \`name\` varchar(128) NOT NULL, \`opening_balance\` decimal(16,2) NOT NULL DEFAULT '0.00', \`current_balance\` decimal(16,2) NOT NULL DEFAULT '0.00', \`expected_balance\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total_cash\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total_card\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total_transfer\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total_yape\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total_plin\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total_returns\` decimal(16,2) NOT NULL DEFAULT '0.00', \`status\` varchar(16) NOT NULL DEFAULT 'CLOSED', \`opened_by\` varchar(100) NULL, \`opened_at\` datetime NULL, \`closed_by\` varchar(100) NULL, \`closed_at\` datetime NULL, \`closing_observations\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sales\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`customer_id\` bigint UNSIGNED NOT NULL, \`billing_snapshot_name\` varchar(150) NULL, \`billing_snapshot_trade_name\` varchar(150) NULL, \`billing_snapshot_document_type_name\` varchar(120) NULL, \`billing_snapshot_document_number\` varchar(20) NULL, \`billing_snapshot_address\` varchar(255) NULL, \`billing_snapshot_email\` varchar(150) NULL, \`cash_register_id\` int NULL, \`sale_type\` varchar(16) NOT NULL DEFAULT 'PRODUCT', \`document_type\` varchar(16) NOT NULL, \`document_series_id\` int NULL, \`series\` varchar(10) NOT NULL, \`number\` varchar(15) NOT NULL, \`issue_date\` date NOT NULL, \`due_date\` date NULL, \`price_list_code\` varchar(32) NULL, \`apply_auto_discounts\` tinyint NOT NULL DEFAULT 1, \`base_subtotal\` decimal(16,2) NOT NULL DEFAULT '0.00', \`subtotal\` decimal(16,2) NOT NULL DEFAULT '0.00', \`discount_total\` decimal(16,2) NOT NULL DEFAULT '0.00', \`tax_amount\` decimal(16,2) NOT NULL DEFAULT '0.00', \`total\` decimal(16,2) NOT NULL DEFAULT '0.00', \`tax_rate\` decimal(5,4) NOT NULL DEFAULT '0.1800', \`status\` varchar(16) NOT NULL DEFAULT 'DRAFT', \`observations\` text NULL, \`created_by\` varchar(100) NULL, \`confirmed_by\` varchar(100) NULL, \`cancelled_by\` varchar(100) NULL, \`cancelled_reason\` text NULL, \`cancelled_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_7a7afe30a3446b2164813f48cd\` (\`company_id\`, \`series\`, \`number\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_diagnoses\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_id\` bigint UNSIGNED NOT NULL, \`sequence_number\` int UNSIGNED NOT NULL DEFAULT '1', \`status\` enum ('CURRENT', 'SUPERSEDED') NOT NULL DEFAULT 'CURRENT', \`outcome\` enum ('REPAIRABLE', 'IRREPARABLE', 'NOT_COST_EFFECTIVE', 'NO_PARTS_AVAILABLE', 'NO_FAULT_FOUND', 'WARRANTY_APPLIES', 'WARRANTY_REJECTED') NOT NULL DEFAULT 'REPAIRABLE', \`summary\` varchar(255) NOT NULL, \`details\` text NULL, \`outcome_reason\` text NULL, \`recommended_action\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_agreement_products\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_agreement_id\` bigint UNSIGNED NOT NULL, \`product_id\` int NULL, \`product_code_snapshot\` varchar(50) NOT NULL, \`product_name_snapshot\` varchar(150) NOT NULL, \`product_description_snapshot\` text NULL, \`quantity\` decimal(10,2) NOT NULL DEFAULT '1.00', \`unit_price\` decimal(10,2) NOT NULL, \`line_total\` decimal(10,2) NOT NULL, \`requires_purchase\` tinyint NOT NULL DEFAULT 0, \`notes\` text NULL, \`provenance\` enum ('NEW', 'INHERITED') NOT NULL DEFAULT 'NEW', \`derived_from_agreement_product_item_id\` bigint UNSIGNED NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_agreement_services\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_agreement_id\` bigint UNSIGNED NOT NULL, \`service_id\` int UNSIGNED NULL, \`service_code_snapshot\` varchar(50) NOT NULL, \`service_name_snapshot\` varchar(150) NOT NULL, \`service_description_snapshot\` text NULL, \`estimated_hours\` decimal(5,2) NOT NULL DEFAULT '1.00', \`unit_price\` decimal(10,2) NOT NULL, \`line_total\` decimal(10,2) NOT NULL, \`notes\` text NULL, \`provenance\` enum ('NEW', 'INHERITED') NOT NULL DEFAULT 'NEW', \`derived_from_agreement_service_item_id\` bigint UNSIGNED NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_agreements\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_id\` bigint UNSIGNED NOT NULL, \`diagnosis_id\` bigint UNSIGNED NULL, \`derived_from_agreement_id\` bigint UNSIGNED NULL, \`sequence_number\` int UNSIGNED NOT NULL DEFAULT '1', \`status\` enum ('DRAFT', 'CONFIRMED', 'SUPERSEDED', 'VOIDED') NOT NULL DEFAULT 'DRAFT', \`source\` enum ('TECHNICIAN_COORDINATION', 'TECHNICAL_SERVICE_AUTO', 'RECEPTION_DIRECT') NOT NULL DEFAULT 'TECHNICIAN_COORDINATION', \`total_amount\` decimal(10,2) NOT NULL, \`notes\` text NULL, \`agreed_at\` datetime NULL, \`agreed_by_user_id\` bigint UNSIGNED NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_sale_links\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_id\` bigint UNSIGNED NOT NULL, \`sale_id\` int NOT NULL, \`agreement_id\` bigint UNSIGNED NULL, \`linked_amount\` decimal(10,2) NOT NULL DEFAULT '0.00', \`linked_by\` varchar(100) NULL, \`linked_at\` datetime NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_events\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_id\` bigint UNSIGNED NOT NULL, \`event_type\` varchar(80) NOT NULL, \`axis\` varchar(40) NULL, \`capability\` varchar(80) NULL, \`from_status\` varchar(80) NULL, \`to_status\` varchar(80) NULL, \`actor_id\` int NULL, \`reason\` text NULL, \`payload_json\` json NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_notification_messages\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`service_order_id\` bigint UNSIGNED NULL, \`channel\` varchar(30) NOT NULL, \`message_type\` varchar(80) NOT NULL, \`recipient\` varchar(50) NULL, \`body\` text NULL, \`idempotency_key\` varchar(180) NOT NULL, \`status\` varchar(30) NOT NULL DEFAULT 'PENDING', \`scope\` varchar(20) NOT NULL DEFAULT 'ORDER', \`metadata_json\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`IDX_7af0c8a394dab1b90ff70935f0\` (\`idempotency_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_notification_delivery_attempts\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`notification_message_id\` bigint UNSIGNED NOT NULL, \`status\` varchar(30) NOT NULL, \`response_payload\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_temp_documents\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`token\` varchar(120) NOT NULL, \`source_type\` varchar(60) NOT NULL, \`mime_type\` varchar(100) NOT NULL, \`file_name\` varchar(255) NOT NULL, \`absolute_path\` varchar(500) NOT NULL, \`expires_at\` datetime NOT NULL, \`metadata_json\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_9edd7a903b54a0f4c2b52a2232\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`tax_configs\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`code\` varchar(32) NOT NULL, \`name\` varchar(128) NOT NULL, \`rate_pct\` decimal(8,4) NOT NULL, \`is_fixed\` tinyint NOT NULL DEFAULT '0', \`applies_to\` varchar(32) NOT NULL DEFAULT 'SALE_PRICE', \`is_active\` tinyint NOT NULL DEFAULT '1', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_f1f49d9a326d9bd5a62a98a961\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`pricing_configs\` (\`id\` int UNSIGNED NOT NULL AUTO_INCREMENT, \`productId\` int NULL, \`categoryId\` int NULL, \`profit_margin_pct\` decimal(8,4) NOT NULL DEFAULT '15.0000', \`max_discount_pct\` decimal(8,4) NOT NULL DEFAULT '7.0000', \`is_active\` tinyint NOT NULL DEFAULT '1', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`operation_keys\` (\`id\` int NOT NULL AUTO_INCREMENT, \`action\` varchar(255) NOT NULL, \`codeHash\` varchar(255) NOT NULL, \`isActive\` tinyint NOT NULL DEFAULT 1, \`rotatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ownerId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`movements\` (\`id\` int NOT NULL AUTO_INCREMENT, \`type\` varchar(8) NOT NULL, \`productId\` int NOT NULL, \`lotId\` int NULL, \`serialId\` int NULL, \`supplierId\` bigint UNSIGNED NULL, \`qty\` decimal(14,4) NOT NULL, \`unitCost\` decimal(14,4) NOT NULL, \`totalCost\` decimal(14,4) NOT NULL, \`reasonCode\` varchar(32) NOT NULL, \`sourceDocType\` varchar(32) NULL, \`sourceDocId\` varchar(64) NULL, \`notes\` text NULL, \`userCreated\` varchar(128) NULL, \`occurredAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, \`balanceQtyPost\` decimal(14,4) NOT NULL, \`balanceTotalCostPost\` decimal(16,4) NOT NULL, \`balanceAvgCostPost\` decimal(14,4) NOT NULL, INDEX \`IDX_bb3879feaed0241aeb0c5c2cd9\` (\`occurredAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`movement_serials\` (\`id\` int NOT NULL AUTO_INCREMENT, \`movementId\` int NOT NULL, \`serialId\` int NOT NULL, \`linkedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX \`IDX_faa42f7db2c6f5a5421b1d34b0\` (\`movementId\`), UNIQUE INDEX \`IDX_00f4b1563a02e1e39ecfe30717\` (\`movementId\`, \`serialId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`count_snapshots\` (\`id\` int NOT NULL AUTO_INCREMENT, \`countId\` int NOT NULL, \`productId\` int NOT NULL, \`lotId\` int NULL, \`qtySystem\` decimal(14,4) NOT NULL, \`avgCostAtFreeze\` decimal(14,4) NOT NULL, \`totalCostAtFreeze\` decimal(16,4) NOT NULL, \`snapshotDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`count_entry_serials\` (\`id\` int NOT NULL AUTO_INCREMENT, \`entryId\` int NOT NULL, \`serialCode\` varchar(64) NOT NULL, \`productId\` int NOT NULL, \`lotId\` int NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_2744d0378d7c6d999beb49f4a3\` (\`entryId\`, \`serialCode\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`count_entries\` (\`id\` int NOT NULL AUTO_INCREMENT, \`countId\` int NOT NULL, \`productId\` int NOT NULL, \`lotId\` int NULL, \`qtyCounted\` decimal(14,4) NOT NULL, \`countedBy\` varchar(64) NOT NULL, \`countedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, \`notes\` text NULL, UNIQUE INDEX \`IDX_2dacdc2e99881505cc0d4e72c4\` (\`countId\`, \`productId\`, \`lotId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`counts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`code\` varchar(32) NOT NULL, \`description\` text NULL, \`status\` varchar(16) NOT NULL DEFAULT 'DRAFT', \`createdBy\` varchar(64) NOT NULL, \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, \`frozenAt\` datetime NULL, \`postedAt\` datetime NULL, UNIQUE INDEX \`IDX_ecc4b5c1824fe41dbbe9895cc5\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`count_differences_summary\` (\`countId\` int NOT NULL, \`surplusValue\` decimal(16,6) NOT NULL DEFAULT '0.000000', \`shortageValue\` decimal(16,6) NOT NULL DEFAULT '0.000000', \`netValue\` decimal(16,6) NOT NULL DEFAULT '0.000000', \`calculatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`calculatedBy\` varchar(64) NOT NULL, PRIMARY KEY (\`countId\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`count_differences\` (\`id\` int NOT NULL AUTO_INCREMENT, \`countId\` int NOT NULL, \`productId\` int NOT NULL, \`lotId\` int NULL, \`qtySystem\` decimal(14,4) NOT NULL, \`qtyCounted\` decimal(14,4) NOT NULL, \`difference\` decimal(14,4) NOT NULL, \`avgCostAtFreeze\` decimal(14,6) NOT NULL, \`valueDifference\` decimal(16,6) NOT NULL, \`calculatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`calculatedBy\` varchar(64) NOT NULL, UNIQUE INDEX \`IDX_1a67b58e948ce9c7983a98db6a\` (\`countId\`, \`productId\`, \`lotId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`password_reset_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`tokenHash\` varchar(64) NOT NULL, \`expiresAt\` datetime NOT NULL, \`usedAt\` datetime NULL, \`ip\` varchar(255) NULL, \`userAgent\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`user_id\` int NULL, UNIQUE INDEX \`IDX_1143abb8c3fad8b06dd857a8c9\` (\`tokenHash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`audit_log\` (\`id\` int NOT NULL AUTO_INCREMENT, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` int NULL, \`actorEmail\` varchar(256) NULL, \`actorName\` varchar(128) NULL, \`action\` varchar(64) NOT NULL, \`entity\` varchar(64) NOT NULL, \`entityId\` varchar(128) NULL, \`method\` varchar(8) NULL, \`path\` varchar(512) NULL, \`status\` int NULL, \`durationMs\` int NULL, \`ip\` varchar(64) NULL, \`userAgent\` varchar(256) NULL, \`requestId\` varchar(64) NULL, \`sessionId\` varchar(64) NULL, \`reason\` varchar(256) NULL, \`keyId\` varchar(128) NULL, \`before\` json NULL, \`after\` json NULL, INDEX \`IDX_219c77b26cbd3d1c91106d9a35\` (\`action\`, \`status\`, \`createdAt\`), INDEX \`IDX_3857a9d8ce88bf6823fd0feaa6\` (\`entity\`, \`entityId\`, \`createdAt\`), INDEX \`IDX_59cb40bbe2a3e5523c1fbb9941\` (\`userId\`, \`createdAt\`), INDEX \`IDX_78e013ffae12f5a1fc1dbefff9\` (\`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_inbox_attachments\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`message_id\` bigint UNSIGNED NOT NULL, \`attachment_type\` enum ('image', 'pdf', 'audio', 'document') NOT NULL, \`file_name\` varchar(255) NOT NULL, \`mime_type\` varchar(150) NOT NULL, \`size_bytes\` bigint UNSIGNED NOT NULL DEFAULT '0', \`provider_media_id\` varchar(180) NULL, \`provider_url\` text NULL, \`cached_file_path\` varchar(500) NULL, \`public_url\` varchar(500) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_inbox_message_order_links\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`message_id\` bigint UNSIGNED NOT NULL, \`service_order_id\` bigint UNSIGNED NOT NULL, \`linked_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_service_order_inbox_message_order_link\` (\`message_id\`, \`service_order_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_inbox_messages\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`thread_id\` bigint UNSIGNED NOT NULL, \`direction\` enum ('INBOUND', 'OUTBOUND') NOT NULL, \`author_role\` enum ('CLIENT', 'TECHNICIAN', 'RECEPTION', 'SUPERVISOR', 'SYSTEM') NOT NULL, \`author_user_id\` int NULL, \`author_display_name\` varchar(150) NULL, \`text\` text NULL, \`delivery_status\` enum ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'RECEIVED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED', \`external_message_id\` varchar(180) NULL, \`provider_payload\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_inbox_thread_order_links\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`thread_id\` bigint UNSIGNED NOT NULL, \`service_order_id\` bigint UNSIGNED NOT NULL, \`linked_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_service_order_inbox_thread_order_link\` (\`thread_id\`, \`service_order_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_inbox_threads\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`client_id\` bigint UNSIGNED NULL, \`client_phone_snapshot\` varchar(50) NULL, \`client_display_name_snapshot\` varchar(150) NULL, \`external_thread_key\` varchar(180) NOT NULL, \`last_message_text\` text NULL, \`last_message_at\` datetime NULL, \`last_customer_message_at\` datetime NULL, \`last_message_direction\` enum ('INBOUND', 'OUTBOUND') NULL, \`last_message_author_role\` enum ('CLIENT', 'TECHNICIAN', 'RECEPTION', 'SUPERVISOR', 'SYSTEM') NULL, \`unread_for_reception\` int UNSIGNED NOT NULL DEFAULT '0', \`unread_for_technician\` int UNSIGNED NOT NULL DEFAULT '0', \`unread_for_supervisor\` int UNSIGNED NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_41092331f5f175b05f8b4a08be\` (\`client_phone_snapshot\`), UNIQUE INDEX \`IDX_3cf7b382448f5dd98358c4a0d3\` (\`external_thread_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`roles_permissions_permissions\` (\`rolesId\` int NOT NULL, \`permissionsId\` int NOT NULL, INDEX \`IDX_dc2b9d46195bb3ed28abbf7c9e\` (\`rolesId\`), INDEX \`IDX_fd4d5d4c7f7ff16c57549b72c6\` (\`permissionsId\`), PRIMARY KEY (\`rolesId\`, \`permissionsId\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users_roles_roles\` (\`usersId\` int NOT NULL, \`rolesId\` int NOT NULL, INDEX \`IDX_df951a64f09865171d2d7a502b\` (\`usersId\`), INDEX \`IDX_b2f0366aa9349789527e0c36d9\` (\`rolesId\`), PRIMARY KEY (\`usersId\`, \`rolesId\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`permissions\` ADD CONSTRAINT \`FK_738f46bb9ac6ea356f1915835d0\` FOREIGN KEY (\`module_id\`) REFERENCES \`permission_modules\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_permissions\` ADD CONSTRAINT \`FK_f05ccc7935f14874d7f89ba030f\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_permissions\` ADD CONSTRAINT \`FK_cf38f85e52ee274ba9a01901ed2\` FOREIGN KEY (\`permissionId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_9e86f4e5144e5f0c754ec343bea\` FOREIGN KEY (\`document_type_id\`) REFERENCES \`document_types\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`suppliers\` ADD CONSTRAINT \`FK_2e23a3c0d38fcac3075b5d86a4d\` FOREIGN KEY (\`document_type_id\`) REFERENCES \`document_types\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sessions\` ADD CONSTRAINT \`FK_57de40bc620f456c7311aa3a1e6\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`technician_assignment_balances\` ADD CONSTRAINT \`FK_9bd3f69139720940b897d1fd02c\` FOREIGN KEY (\`technician_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`client_contacts\` ADD CONSTRAINT \`FK_ef47f3aae4b36f0aaedbfc04161\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD CONSTRAINT \`FK_2d707eafd052c0e30d4f5514529\` FOREIGN KEY (\`document_type_id\`) REFERENCES \`document_types\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` ADD CONSTRAINT \`FK_b8d5a3f6aa433bb61a26015be0d\` FOREIGN KEY (\`assigned_to_technician_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` ADD CONSTRAINT \`FK_26c3dc95f5019d377fbd9c649a3\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` ADD CONSTRAINT \`FK_723d590389d3c6f136207db1f80\` FOREIGN KEY (\`client_contact_id\`) REFERENCES \`client_contacts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` ADD CONSTRAINT \`FK_38ab60bfda5e50d3e6349c7cc6e\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` ADD CONSTRAINT \`FK_c3ddf03138f62b78d7874cd8c2c\` FOREIGN KEY (\`closed_by\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` ADD CONSTRAINT \`FK_19b34ddd3b32361a4222c702f99\` FOREIGN KEY (\`cancelled_by\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`lots\` ADD CONSTRAINT \`FK_35a1a6e15f94d9204be952ed03f\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`lots\` ADD CONSTRAINT \`FK_92e10f66781cb166d244b7548f7\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`serials\` ADD CONSTRAINT \`FK_4d188bb4e65beaf6fea7d3f7132\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`serials\` ADD CONSTRAINT \`FK_17933d690b208088338ff100c79\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`serials\` ADD CONSTRAINT \`FK_28eb5769f6d39759bcb8f6f305a\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock\` ADD CONSTRAINT \`FK_e855a71c31948188c2bf78824a5\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock\` ADD CONSTRAINT \`FK_8c8200405bb1e623fe7b54f8505\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_ff56834e735fa78a15d0cf21926\` FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_8f02492cd2cba26de537ffd6b98\` FOREIGN KEY (\`baseUnitId\`) REFERENCES \`units\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` ADD CONSTRAINT \`FK_c210a330b80232c29c2ad68462a\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` ADD CONSTRAINT \`FK_4ecae62db3f9e9cc9a368d57adb\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` ADD CONSTRAINT \`FK_49344c1099c8ff8d3ad4379e3da\` FOREIGN KEY (\`lot_id\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_payments\` ADD CONSTRAINT \`FK_0e4445597642c2456ebdd7e23b1\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_line_discounts\` ADD CONSTRAINT \`FK_c27fb5fd7f98e79b091cf6a5785\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_line_discounts\` ADD CONSTRAINT \`FK_b31ad55e3021bad66c3f2ec2ec0\` FOREIGN KEY (\`sale_item_id\`) REFERENCES \`sale_items\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_combo_items\` ADD CONSTRAINT \`FK_88a6dc4155064799525e2be0a7a\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_combo_items\` ADD CONSTRAINT \`FK_332fa563f2fff7f7890a8e63c2d\` FOREIGN KEY (\`sale_item_id\`) REFERENCES \`sale_items\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_combo_items\` ADD CONSTRAINT \`FK_06b4d3c2d3f2537c331256bd802\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`cash_flow_transactions\` ADD CONSTRAINT \`FK_ce3e2156be7bf04e0a8048a4139\` FOREIGN KEY (\`cash_register_id\`) REFERENCES \`cash_registers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`cash_flow_transactions\` ADD CONSTRAINT \`FK_fc97db46369d31ab7f6cf28e950\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD CONSTRAINT \`FK_c51005b2b06cec7aa17462c54f5\` FOREIGN KEY (\`customer_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD CONSTRAINT \`FK_5cfc9e8b83f5a30a6b9a89597f6\` FOREIGN KEY (\`cash_register_id\`) REFERENCES \`cash_registers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD CONSTRAINT \`FK_b6f857105af94fd337ab7bdf25b\` FOREIGN KEY (\`document_series_id\`) REFERENCES \`document_series\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_diagnoses\` ADD CONSTRAINT \`FK_ebc0fdb58bf8ddceedeb3e529f6\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreement_products\` ADD CONSTRAINT \`FK_86e8ac253b40b17023893b8615b\` FOREIGN KEY (\`service_order_agreement_id\`) REFERENCES \`service_order_agreements\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreement_products\` ADD CONSTRAINT \`FK_01ded7efa622e251708d10f3a51\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreement_services\` ADD CONSTRAINT \`FK_1421c84aa6d56a851270c1e5ad4\` FOREIGN KEY (\`service_order_agreement_id\`) REFERENCES \`service_order_agreements\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreements\` ADD CONSTRAINT \`FK_b853c4d3eec9ecf84fe819a5bda\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreements\` ADD CONSTRAINT \`FK_02bb8b32d3e289fdc5a55be9f79\` FOREIGN KEY (\`diagnosis_id\`) REFERENCES \`service_order_diagnoses\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_sale_links\` ADD CONSTRAINT \`FK_db59d16bd7c27e5053d6542907b\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_sale_links\` ADD CONSTRAINT \`FK_4ffdf51be5f0be914e9814aad48\` FOREIGN KEY (\`sale_id\`) REFERENCES \`sales\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_sale_links\` ADD CONSTRAINT \`FK_403bdd14b177c2953adcc1945a0\` FOREIGN KEY (\`agreement_id\`) REFERENCES \`service_order_agreements\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_events\` ADD CONSTRAINT \`FK_7ea87d29e864cc3500ebb308c82\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_events\` ADD CONSTRAINT \`FK_38af515254a53ee2dceccb04bcc\` FOREIGN KEY (\`actor_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_notification_messages\` ADD CONSTRAINT \`FK_98f070b9977bcb09c57495f56ae\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_notification_delivery_attempts\` ADD CONSTRAINT \`FK_82cb90c65a792388cde66b77dc7\` FOREIGN KEY (\`notification_message_id\`) REFERENCES \`service_order_notification_messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`pricing_configs\` ADD CONSTRAINT \`FK_f9381a7f4b516ed5790cdea4360\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`pricing_configs\` ADD CONSTRAINT \`FK_e3cf0ca83ad8a8c908a27fd60aa\` FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`operation_keys\` ADD CONSTRAINT \`FK_772d8ae15c7a9c18168ae370e55\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` ADD CONSTRAINT \`FK_dbc4be265a76d7a5204db204332\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` ADD CONSTRAINT \`FK_ec281c94d56f6d85fe25e1190e6\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` ADD CONSTRAINT \`FK_57ae7f75b778d6ab3e3ee058e32\` FOREIGN KEY (\`serialId\`) REFERENCES \`serials\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` ADD CONSTRAINT \`FK_d29ec1f0350ba94874b49a2f616\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`movement_serials\` ADD CONSTRAINT \`FK_faa42f7db2c6f5a5421b1d34b0d\` FOREIGN KEY (\`movementId\`) REFERENCES \`movements\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`movement_serials\` ADD CONSTRAINT \`FK_d077c189ae00786ac902456acfb\` FOREIGN KEY (\`serialId\`) REFERENCES \`serials\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_snapshots\` ADD CONSTRAINT \`FK_7de09eede85b1d7aa68cd0d1ebd\` FOREIGN KEY (\`countId\`) REFERENCES \`counts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_snapshots\` ADD CONSTRAINT \`FK_aee72397ec8f4385be5329fc19f\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_snapshots\` ADD CONSTRAINT \`FK_564cbaa582c3ea1f1156a2c4235\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entry_serials\` ADD CONSTRAINT \`FK_f778ad4f66f2b560318d9f288c6\` FOREIGN KEY (\`entryId\`) REFERENCES \`count_entries\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entry_serials\` ADD CONSTRAINT \`FK_4a10156d47b7fafc3a6d2fd3313\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entry_serials\` ADD CONSTRAINT \`FK_1a0ff1fe0d3cbdab570c2935c3f\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entries\` ADD CONSTRAINT \`FK_2ff0d3814b2b084f925def4d097\` FOREIGN KEY (\`countId\`) REFERENCES \`counts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entries\` ADD CONSTRAINT \`FK_0254e42f92bb5942b82da8e92bb\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entries\` ADD CONSTRAINT \`FK_fe077fc89c005a03d1f93ca5964\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_differences\` ADD CONSTRAINT \`FK_e67b48cf7be7840ac9100bfb182\` FOREIGN KEY (\`countId\`) REFERENCES \`counts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_differences\` ADD CONSTRAINT \`FK_6ff828cccff30605bf4f829a2b7\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_differences\` ADD CONSTRAINT \`FK_973cd05ff5c6eaff68930a3ca21\` FOREIGN KEY (\`lotId\`) REFERENCES \`lots\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_reset_tokens\` ADD CONSTRAINT \`FK_52ac39dd8a28730c63aeb428c9c\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_attachments\` ADD CONSTRAINT \`FK_0275ef9c4f18375132afa22af3f\` FOREIGN KEY (\`message_id\`) REFERENCES \`service_order_inbox_messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_message_order_links\` ADD CONSTRAINT \`FK_2570297eef84ea264edf67643d0\` FOREIGN KEY (\`message_id\`) REFERENCES \`service_order_inbox_messages\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_message_order_links\` ADD CONSTRAINT \`FK_ff348b8b3c79a7069ef8a668888\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_messages\` ADD CONSTRAINT \`FK_7b464e718bc43b1331c67b30e75\` FOREIGN KEY (\`thread_id\`) REFERENCES \`service_order_inbox_threads\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_thread_order_links\` ADD CONSTRAINT \`FK_036c3282021477c9a6e64849410\` FOREIGN KEY (\`thread_id\`) REFERENCES \`service_order_inbox_threads\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_thread_order_links\` ADD CONSTRAINT \`FK_d195c15a90160d5e6bdfa482d93\` FOREIGN KEY (\`service_order_id\`) REFERENCES \`service_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles_permissions_permissions\` ADD CONSTRAINT \`FK_dc2b9d46195bb3ed28abbf7c9e3\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles_permissions_permissions\` ADD CONSTRAINT \`FK_fd4d5d4c7f7ff16c57549b72c6f\` FOREIGN KEY (\`permissionsId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users_roles_roles\` ADD CONSTRAINT \`FK_df951a64f09865171d2d7a502b1\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users_roles_roles\` ADD CONSTRAINT \`FK_b2f0366aa9349789527e0c36d97\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users_roles_roles\` DROP FOREIGN KEY \`FK_b2f0366aa9349789527e0c36d97\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users_roles_roles\` DROP FOREIGN KEY \`FK_df951a64f09865171d2d7a502b1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles_permissions_permissions\` DROP FOREIGN KEY \`FK_fd4d5d4c7f7ff16c57549b72c6f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles_permissions_permissions\` DROP FOREIGN KEY \`FK_dc2b9d46195bb3ed28abbf7c9e3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_thread_order_links\` DROP FOREIGN KEY \`FK_d195c15a90160d5e6bdfa482d93\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_thread_order_links\` DROP FOREIGN KEY \`FK_036c3282021477c9a6e64849410\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_messages\` DROP FOREIGN KEY \`FK_7b464e718bc43b1331c67b30e75\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_message_order_links\` DROP FOREIGN KEY \`FK_ff348b8b3c79a7069ef8a668888\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_message_order_links\` DROP FOREIGN KEY \`FK_2570297eef84ea264edf67643d0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_inbox_attachments\` DROP FOREIGN KEY \`FK_0275ef9c4f18375132afa22af3f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`password_reset_tokens\` DROP FOREIGN KEY \`FK_52ac39dd8a28730c63aeb428c9c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_differences\` DROP FOREIGN KEY \`FK_973cd05ff5c6eaff68930a3ca21\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_differences\` DROP FOREIGN KEY \`FK_6ff828cccff30605bf4f829a2b7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_differences\` DROP FOREIGN KEY \`FK_e67b48cf7be7840ac9100bfb182\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entries\` DROP FOREIGN KEY \`FK_fe077fc89c005a03d1f93ca5964\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entries\` DROP FOREIGN KEY \`FK_0254e42f92bb5942b82da8e92bb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entries\` DROP FOREIGN KEY \`FK_2ff0d3814b2b084f925def4d097\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entry_serials\` DROP FOREIGN KEY \`FK_1a0ff1fe0d3cbdab570c2935c3f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entry_serials\` DROP FOREIGN KEY \`FK_4a10156d47b7fafc3a6d2fd3313\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_entry_serials\` DROP FOREIGN KEY \`FK_f778ad4f66f2b560318d9f288c6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_snapshots\` DROP FOREIGN KEY \`FK_564cbaa582c3ea1f1156a2c4235\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_snapshots\` DROP FOREIGN KEY \`FK_aee72397ec8f4385be5329fc19f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`count_snapshots\` DROP FOREIGN KEY \`FK_7de09eede85b1d7aa68cd0d1ebd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`movement_serials\` DROP FOREIGN KEY \`FK_d077c189ae00786ac902456acfb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`movement_serials\` DROP FOREIGN KEY \`FK_faa42f7db2c6f5a5421b1d34b0d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` DROP FOREIGN KEY \`FK_d29ec1f0350ba94874b49a2f616\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` DROP FOREIGN KEY \`FK_57ae7f75b778d6ab3e3ee058e32\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` DROP FOREIGN KEY \`FK_ec281c94d56f6d85fe25e1190e6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`movements\` DROP FOREIGN KEY \`FK_dbc4be265a76d7a5204db204332\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`operation_keys\` DROP FOREIGN KEY \`FK_772d8ae15c7a9c18168ae370e55\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`pricing_configs\` DROP FOREIGN KEY \`FK_e3cf0ca83ad8a8c908a27fd60aa\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`pricing_configs\` DROP FOREIGN KEY \`FK_f9381a7f4b516ed5790cdea4360\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_notification_delivery_attempts\` DROP FOREIGN KEY \`FK_82cb90c65a792388cde66b77dc7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_notification_messages\` DROP FOREIGN KEY \`FK_98f070b9977bcb09c57495f56ae\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_events\` DROP FOREIGN KEY \`FK_38af515254a53ee2dceccb04bcc\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_events\` DROP FOREIGN KEY \`FK_7ea87d29e864cc3500ebb308c82\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_sale_links\` DROP FOREIGN KEY \`FK_403bdd14b177c2953adcc1945a0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_sale_links\` DROP FOREIGN KEY \`FK_4ffdf51be5f0be914e9814aad48\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_sale_links\` DROP FOREIGN KEY \`FK_db59d16bd7c27e5053d6542907b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreements\` DROP FOREIGN KEY \`FK_02bb8b32d3e289fdc5a55be9f79\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreements\` DROP FOREIGN KEY \`FK_b853c4d3eec9ecf84fe819a5bda\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreement_services\` DROP FOREIGN KEY \`FK_1421c84aa6d56a851270c1e5ad4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreement_products\` DROP FOREIGN KEY \`FK_01ded7efa622e251708d10f3a51\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_agreement_products\` DROP FOREIGN KEY \`FK_86e8ac253b40b17023893b8615b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_diagnoses\` DROP FOREIGN KEY \`FK_ebc0fdb58bf8ddceedeb3e529f6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP FOREIGN KEY \`FK_b6f857105af94fd337ab7bdf25b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP FOREIGN KEY \`FK_5cfc9e8b83f5a30a6b9a89597f6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP FOREIGN KEY \`FK_c51005b2b06cec7aa17462c54f5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`cash_flow_transactions\` DROP FOREIGN KEY \`FK_fc97db46369d31ab7f6cf28e950\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`cash_flow_transactions\` DROP FOREIGN KEY \`FK_ce3e2156be7bf04e0a8048a4139\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_combo_items\` DROP FOREIGN KEY \`FK_06b4d3c2d3f2537c331256bd802\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_combo_items\` DROP FOREIGN KEY \`FK_332fa563f2fff7f7890a8e63c2d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_combo_items\` DROP FOREIGN KEY \`FK_88a6dc4155064799525e2be0a7a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_line_discounts\` DROP FOREIGN KEY \`FK_b31ad55e3021bad66c3f2ec2ec0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_line_discounts\` DROP FOREIGN KEY \`FK_c27fb5fd7f98e79b091cf6a5785\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_payments\` DROP FOREIGN KEY \`FK_0e4445597642c2456ebdd7e23b1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` DROP FOREIGN KEY \`FK_49344c1099c8ff8d3ad4379e3da\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` DROP FOREIGN KEY \`FK_4ecae62db3f9e9cc9a368d57adb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` DROP FOREIGN KEY \`FK_c210a330b80232c29c2ad68462a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_8f02492cd2cba26de537ffd6b98\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_ff56834e735fa78a15d0cf21926\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock\` DROP FOREIGN KEY \`FK_8c8200405bb1e623fe7b54f8505\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock\` DROP FOREIGN KEY \`FK_e855a71c31948188c2bf78824a5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`serials\` DROP FOREIGN KEY \`FK_28eb5769f6d39759bcb8f6f305a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`serials\` DROP FOREIGN KEY \`FK_17933d690b208088338ff100c79\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`serials\` DROP FOREIGN KEY \`FK_4d188bb4e65beaf6fea7d3f7132\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`lots\` DROP FOREIGN KEY \`FK_92e10f66781cb166d244b7548f7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`lots\` DROP FOREIGN KEY \`FK_35a1a6e15f94d9204be952ed03f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` DROP FOREIGN KEY \`FK_19b34ddd3b32361a4222c702f99\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` DROP FOREIGN KEY \`FK_c3ddf03138f62b78d7874cd8c2c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` DROP FOREIGN KEY \`FK_38ab60bfda5e50d3e6349c7cc6e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` DROP FOREIGN KEY \`FK_723d590389d3c6f136207db1f80\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` DROP FOREIGN KEY \`FK_26c3dc95f5019d377fbd9c649a3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` DROP FOREIGN KEY \`FK_b8d5a3f6aa433bb61a26015be0d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP FOREIGN KEY \`FK_2d707eafd052c0e30d4f5514529\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`client_contacts\` DROP FOREIGN KEY \`FK_ef47f3aae4b36f0aaedbfc04161\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`technician_assignment_balances\` DROP FOREIGN KEY \`FK_9bd3f69139720940b897d1fd02c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sessions\` DROP FOREIGN KEY \`FK_57de40bc620f456c7311aa3a1e6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`suppliers\` DROP FOREIGN KEY \`FK_2e23a3c0d38fcac3075b5d86a4d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_9e86f4e5144e5f0c754ec343bea\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_permissions\` DROP FOREIGN KEY \`FK_cf38f85e52ee274ba9a01901ed2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_permissions\` DROP FOREIGN KEY \`FK_f05ccc7935f14874d7f89ba030f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`permissions\` DROP FOREIGN KEY \`FK_738f46bb9ac6ea356f1915835d0\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_b2f0366aa9349789527e0c36d9\` ON \`users_roles_roles\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_df951a64f09865171d2d7a502b\` ON \`users_roles_roles\``,
    );
    await queryRunner.query(`DROP TABLE \`users_roles_roles\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_fd4d5d4c7f7ff16c57549b72c6\` ON \`roles_permissions_permissions\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_dc2b9d46195bb3ed28abbf7c9e\` ON \`roles_permissions_permissions\``,
    );
    await queryRunner.query(`DROP TABLE \`roles_permissions_permissions\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_3cf7b382448f5dd98358c4a0d3\` ON \`service_order_inbox_threads\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_41092331f5f175b05f8b4a08be\` ON \`service_order_inbox_threads\``,
    );
    await queryRunner.query(`DROP TABLE \`service_order_inbox_threads\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_service_order_inbox_thread_order_link\` ON \`service_order_inbox_thread_order_links\``,
    );
    await queryRunner.query(
      `DROP TABLE \`service_order_inbox_thread_order_links\``,
    );
    await queryRunner.query(`DROP TABLE \`service_order_inbox_messages\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_service_order_inbox_message_order_link\` ON \`service_order_inbox_message_order_links\``,
    );
    await queryRunner.query(
      `DROP TABLE \`service_order_inbox_message_order_links\``,
    );
    await queryRunner.query(`DROP TABLE \`service_order_inbox_attachments\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_78e013ffae12f5a1fc1dbefff9\` ON \`audit_log\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_59cb40bbe2a3e5523c1fbb9941\` ON \`audit_log\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_3857a9d8ce88bf6823fd0feaa6\` ON \`audit_log\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_219c77b26cbd3d1c91106d9a35\` ON \`audit_log\``,
    );
    await queryRunner.query(`DROP TABLE \`audit_log\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_1143abb8c3fad8b06dd857a8c9\` ON \`password_reset_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`password_reset_tokens\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_1a67b58e948ce9c7983a98db6a\` ON \`count_differences\``,
    );
    await queryRunner.query(`DROP TABLE \`count_differences\``);
    await queryRunner.query(`DROP TABLE \`count_differences_summary\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_ecc4b5c1824fe41dbbe9895cc5\` ON \`counts\``,
    );
    await queryRunner.query(`DROP TABLE \`counts\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_2dacdc2e99881505cc0d4e72c4\` ON \`count_entries\``,
    );
    await queryRunner.query(`DROP TABLE \`count_entries\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_2744d0378d7c6d999beb49f4a3\` ON \`count_entry_serials\``,
    );
    await queryRunner.query(`DROP TABLE \`count_entry_serials\``);
    await queryRunner.query(`DROP TABLE \`count_snapshots\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_00f4b1563a02e1e39ecfe30717\` ON \`movement_serials\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_faa42f7db2c6f5a5421b1d34b0\` ON \`movement_serials\``,
    );
    await queryRunner.query(`DROP TABLE \`movement_serials\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_bb3879feaed0241aeb0c5c2cd9\` ON \`movements\``,
    );
    await queryRunner.query(`DROP TABLE \`movements\``);
    await queryRunner.query(`DROP TABLE \`operation_keys\``);
    await queryRunner.query(`DROP TABLE \`pricing_configs\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_f1f49d9a326d9bd5a62a98a961\` ON \`tax_configs\``,
    );
    await queryRunner.query(`DROP TABLE \`tax_configs\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_9edd7a903b54a0f4c2b52a2232\` ON \`service_order_temp_documents\``,
    );
    await queryRunner.query(`DROP TABLE \`service_order_temp_documents\``);
    await queryRunner.query(
      `DROP TABLE \`service_order_notification_delivery_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_7af0c8a394dab1b90ff70935f0\` ON \`service_order_notification_messages\``,
    );
    await queryRunner.query(
      `DROP TABLE \`service_order_notification_messages\``,
    );
    await queryRunner.query(`DROP TABLE \`service_order_events\``);
    await queryRunner.query(`DROP TABLE \`service_order_sale_links\``);
    await queryRunner.query(`DROP TABLE \`service_order_agreements\``);
    await queryRunner.query(`DROP TABLE \`service_order_agreement_services\``);
    await queryRunner.query(`DROP TABLE \`service_order_agreement_products\``);
    await queryRunner.query(`DROP TABLE \`service_order_diagnoses\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_7a7afe30a3446b2164813f48cd\` ON \`sales\``,
    );
    await queryRunner.query(`DROP TABLE \`sales\``);
    await queryRunner.query(`DROP TABLE \`cash_registers\``);
    await queryRunner.query(`DROP TABLE \`cash_flow_transactions\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_6616aa67d31d741f6ed06d6d1f\` ON \`document_series\``,
    );
    await queryRunner.query(`DROP TABLE \`document_series\``);
    await queryRunner.query(`DROP TABLE \`sale_combo_items\``);
    await queryRunner.query(`DROP TABLE \`sale_line_discounts\``);
    await queryRunner.query(`DROP TABLE \`sale_payments\``);
    await queryRunner.query(`DROP TABLE \`sale_items\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_c44ac33a05b144dd0d9ddcf932\` ON \`products\``,
    );
    await queryRunner.query(`DROP TABLE \`products\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_495f9e1298489db58e5052db42\` ON \`stock\``,
    );
    await queryRunner.query(`DROP TABLE \`stock\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_c57c159e9d5cfa0ef389f58a7e\` ON \`serials\``,
    );
    await queryRunner.query(`DROP TABLE \`serials\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_05cfec1a482b2ba09642a9d7f5\` ON \`lots\``,
    );
    await queryRunner.query(`DROP TABLE \`lots\``);
    await queryRunner.query(`DROP TABLE \`units\``);
    await queryRunner.query(`DROP TABLE \`categories\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_a55f4001e5983576c521eb7589\` ON \`service_orders\``,
    );
    await queryRunner.query(`DROP TABLE \`service_orders\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_e18b20723103a857857d78536e\` ON \`clients\``,
    );
    await queryRunner.query(`DROP TABLE \`clients\``);
    await queryRunner.query(`DROP TABLE \`client_contacts\``);
    await queryRunner.query(
      `DROP INDEX \`uq_technician_assignment_balance\` ON \`technician_assignment_balances\``,
    );
    await queryRunner.query(`DROP TABLE \`technician_assignment_balances\``);
    await queryRunner.query(`DROP TABLE \`sessions\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_fccf1e6f85418f6ce60938ab14\` ON \`suppliers\``,
    );
    await queryRunner.query(`DROP TABLE \`suppliers\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_9919ce10860709c1f0f115062b\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_803cd247b7c1c8d91b30a3eb21\` ON \`document_types\``,
    );
    await queryRunner.query(`DROP TABLE \`document_types\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_4d0e283b03781d1796e62dc619\` ON \`user_permissions\``,
    );
    await queryRunner.query(`DROP TABLE \`user_permissions\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_648e3f5447f725579d7d4ffdfb\` ON \`roles\``,
    );
    await queryRunner.query(`DROP TABLE \`roles\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_8dad765629e83229da6feda1c1\` ON \`permissions\``,
    );
    await queryRunner.query(`DROP TABLE \`permissions\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_permission_modules_module_key\` ON \`permission_modules\``,
    );
    await queryRunner.query(`DROP TABLE \`permission_modules\``);
  }
}
