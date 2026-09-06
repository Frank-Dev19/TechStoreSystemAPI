import { MigrationInterface, QueryRunner } from 'typeorm';

const TECHNICAL_STATUSES = [
  'PENDIENTE_ASIGNACION',
  'ASIGNADA',
  'EN_DIAGNOSTICO',
  'DIAGNOSTICADA',
  'PENDIENTE_DEFINICION_COMERCIAL',
  'AUTORIZADA_PARA_EJECUCION',
  'EN_EJECUCION',
  'BLOQUEADA',
  'ESPERANDO_REPUESTOS_O_TERCERO',
  'RESUELTA',
  'SIN_SOLUCION',
  'GARANTIA_RECHAZADA',
];

export class WarrantyRejectedTechnicalStatus1788393600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const enumValues = TECHNICAL_STATUSES.map((status) => `'${status}'`).join(
      ',',
    );
    await queryRunner.query(
      `ALTER TABLE service_orders MODIFY technical_status enum(${enumValues}) NOT NULL DEFAULT 'PENDIENTE_ASIGNACION'`,
    );
    await queryRunner.query(
      `ALTER TABLE service_order_items MODIFY technical_status enum(${enumValues}) NOT NULL`,
    );
    await queryRunner.query(`
      UPDATE service_order_items item
      INNER JOIN warranty_claims claim ON claim.service_order_item_id = item.id
      SET item.technical_status = 'GARANTIA_RECHAZADA',
          item.operative_status = 'LISTA_PARA_ENTREGA',
          item.service_completed_at = COALESCE(item.service_completed_at, claim.resolved_at, NOW()),
          item.ready_for_pickup_at = COALESCE(item.ready_for_pickup_at, claim.resolved_at, NOW()),
          item.resolved_at = COALESCE(item.resolved_at, claim.resolved_at, NOW())
      WHERE claim.status = 'RESOLVED_REJECTED'
        AND item.technical_status = 'SIN_SOLUCION'
    `);
    await queryRunner.query(`
      UPDATE service_orders service_order
      INNER JOIN warranty_claims claim ON claim.service_order_id = service_order.id
      SET service_order.technical_status = 'GARANTIA_RECHAZADA',
          service_order.operative_status = 'LISTA_PARA_ENTREGA',
          service_order.service_completed_at = COALESCE(service_order.service_completed_at, claim.resolved_at, NOW()),
          service_order.ready_for_pickup_at = COALESCE(service_order.ready_for_pickup_at, claim.resolved_at, NOW()),
          service_order.resolved_at = COALESCE(service_order.resolved_at, claim.resolved_at, NOW())
      WHERE claim.status = 'RESOLVED_REJECTED'
        AND service_order.technical_status = 'SIN_SOLUCION'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE service_order_items SET technical_status = 'RESUELTA' WHERE technical_status = 'GARANTIA_RECHAZADA'",
    );
    await queryRunner.query(
      "UPDATE service_orders SET technical_status = 'RESUELTA' WHERE technical_status = 'GARANTIA_RECHAZADA'",
    );
    const enumValues = TECHNICAL_STATUSES.filter(
      (status) => status !== 'GARANTIA_RECHAZADA',
    )
      .map((status) => `'${status}'`)
      .join(',');
    await queryRunner.query(
      `ALTER TABLE service_orders MODIFY technical_status enum(${enumValues}) NOT NULL DEFAULT 'PENDIENTE_ASIGNACION'`,
    );
    await queryRunner.query(
      `ALTER TABLE service_order_items MODIFY technical_status enum(${enumValues}) NOT NULL`,
    );
  }
}
