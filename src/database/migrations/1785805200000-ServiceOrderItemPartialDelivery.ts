import { MigrationInterface, QueryRunner } from 'typeorm';

const OPERATIVE_VALUES =
  "'ABIERTA','EN_PROCESO','CANCELACION_SOLICITADA','LISTA_PARA_ENTREGA','ENTREGA_PARCIAL','ENTREGADA','CANCELADA','CERRADA_SIN_SOLUCION'";
const OPERATIVE_VALUES_WITHOUT_PARTIAL =
  "'ABIERTA','EN_PROCESO','CANCELACION_SOLICITADA','LISTA_PARA_ENTREGA','ENTREGADA','CANCELADA','CERRADA_SIN_SOLUCION'";

export class ServiceOrderItemPartialDelivery1785805200000 implements MigrationInterface {
  name = 'ServiceOrderItemPartialDelivery1785805200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES}) NOT NULL DEFAULT 'ABIERTA'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_items\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES}) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `service_orders` SET `operative_status` = 'EN_PROCESO' WHERE `operative_status` = 'ENTREGA_PARCIAL'",
    );
    await queryRunner.query(
      `ALTER TABLE \`service_orders\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES_WITHOUT_PARTIAL}) NOT NULL DEFAULT 'ABIERTA'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_order_items\` MODIFY \`operative_status\` enum (${OPERATIVE_VALUES_WITHOUT_PARTIAL}) NOT NULL`,
    );
  }
}
