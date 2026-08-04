import { MigrationInterface, QueryRunner } from 'typeorm';

const OPERATIVE_VALUES =
  "'ABIERTA','EN_PROCESO','CANCELACION_SOLICITADA','LISTA_PARA_ENTREGA','ENTREGADA','CANCELADA','CERRADA_SIN_SOLUCION'";
const OPERATIVE_VALUES_WITHOUT_PENDING =
  "'ABIERTA','EN_PROCESO','LISTA_PARA_ENTREGA','ENTREGADA','CANCELADA','CERRADA_SIN_SOLUCION'";

export class ServiceOrderItemCancellations1785801600000 implements MigrationInterface {
  name = 'ServiceOrderItemCancellations1785801600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES}) NOT NULL DEFAULT 'ABIERTA'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_items\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES}) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE \`service_order_item_cancellation_requests\` (
        \`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
        \`service_order_item_id\` bigint UNSIGNED NOT NULL,
        \`status\` enum ('PENDING','AWAITING_CLIENT_ACCEPTANCE','APPROVED','REJECTED') NOT NULL,
        \`resolution\` enum ('APPROVED_WITHOUT_CHARGE','APPROVED_WITH_CHARGE','REJECTED') NULL,
        \`channel\` enum ('WHATSAPP','PHONE','IN_PERSON','EMAIL','OTHER') NOT NULL,
        \`reason\` text NOT NULL,
        \`requested_by_user_id\` int NOT NULL,
        \`requested_at\` datetime NOT NULL,
        \`previous_operative_status\` enum (${OPERATIVE_VALUES}) NOT NULL,
        \`previous_technical_status\` enum ('PENDIENTE_ASIGNACION','ASIGNADA','EN_DIAGNOSTICO','DIAGNOSTICADA','PENDIENTE_DEFINICION_COMERCIAL','AUTORIZADA_PARA_EJECUCION','EN_EJECUCION','BLOQUEADA','ESPERANDO_REPUESTOS_O_TERCERO','RESUELTA','SIN_SOLUCION') NOT NULL,
        \`resolved_by_user_id\` int NULL,
        \`resolved_at\` datetime NULL,
        \`resolution_reason\` text NULL,
        \`charge_amount\` decimal(12,2) NULL,
        \`commercial_version_id\` bigint UNSIGNED NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_service_order_item_cancellation_status\` (\`service_order_item_id\`, \`status\`),
        INDEX \`IDX_service_order_item_cancellation_requester\` (\`requested_by_user_id\`),
        INDEX \`IDX_service_order_item_cancellation_resolver\` (\`resolved_by_user_id\`),
        INDEX \`IDX_service_order_item_cancellation_version\` (\`commercial_version_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_service_order_item_cancellation_item\` FOREIGN KEY (\`service_order_item_id\`) REFERENCES \`service_order_items\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_service_order_item_cancellation_requester\` FOREIGN KEY (\`requested_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_service_order_item_cancellation_resolver\` FOREIGN KEY (\`resolved_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_service_order_item_cancellation_version\` FOREIGN KEY (\`commercial_version_id\`) REFERENCES \`service_order_item_commercial_versions\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE `service_order_item_cancellation_requests`',
    );
    await queryRunner.query(
      "UPDATE `service_orders` SET `operative_status` = 'EN_PROCESO' WHERE `operative_status` = 'CANCELACION_SOLICITADA'",
    );
    await queryRunner.query(
      "UPDATE `service_order_items` SET `operative_status` = 'EN_PROCESO' WHERE `operative_status` = 'CANCELACION_SOLICITADA'",
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES_WITHOUT_PENDING}) NOT NULL DEFAULT 'ABIERTA'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_items\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES_WITHOUT_PENDING}) NOT NULL`,
    );
  }
}
