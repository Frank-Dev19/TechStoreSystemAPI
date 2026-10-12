import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomaticCustomerConcept1791676800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE service_order_item_commercial_versions MODIFY customer_summary TEXT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const oversized = await queryRunner.query('SELECT id FROM service_order_item_commercial_versions WHERE CHAR_LENGTH(customer_summary) > 500 LIMIT 1');
    if (oversized.length) throw new Error('No se puede reducir customer_summary sin truncar conceptos existentes');
    await queryRunner.query('ALTER TABLE service_order_item_commercial_versions MODIFY customer_summary varchar(500) NULL');
  }
}
