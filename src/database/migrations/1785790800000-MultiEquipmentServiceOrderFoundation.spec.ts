import { QueryRunner } from 'typeorm';
import { MultiEquipmentServiceOrderFoundation1785790800000 } from './1785790800000-MultiEquipmentServiceOrderFoundation';

describe('MultiEquipmentServiceOrderFoundation1785790800000', () => {
  const previousFlag = process.env.ALLOW_SERVICE_ORDER_DATA_RESET;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.ALLOW_SERVICE_ORDER_DATA_RESET;
    else process.env.ALLOW_SERVICE_ORDER_DATA_RESET = previousFlag;
  });

  it('aborta antes de ejecutar SQL cuando falta la autorización destructiva', async () => {
    delete process.env.ALLOW_SERVICE_ORDER_DATA_RESET;
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await expect(new MultiEquipmentServiceOrderFoundation1785790800000().up(queryRunner)).rejects.toThrow(
      'ALLOW_SERVICE_ORDER_DATA_RESET=true',
    );
    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it('elimina solo el dominio de órdenes y crea las tablas agregadas', async () => {
    process.env.ALLOW_SERVICE_ORDER_DATA_RESET = 'true';
    const executed: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        executed.push(sql.replace(/\s+/g, ' ').trim());
      }),
    } as unknown as QueryRunner;

    await new MultiEquipmentServiceOrderFoundation1785790800000().up(queryRunner);

    expect(executed).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DELETE FROM `service_order_inbox_message_order_links`'),
        expect.stringContaining('DELETE FROM `service_order_sale_links`'),
        expect.stringContaining('DELETE FROM `service_orders`'),
        expect.stringContaining('CREATE TABLE `service_order_daily_sequences`'),
        expect.stringContaining('CREATE TABLE `service_order_items`'),
        expect.stringContaining('CREATE TABLE `service_order_item_commercial_versions`'),
        expect.stringContaining('`derived_from_version_id` bigint UNSIGNED NULL'),
        expect.stringContaining('FK_item_commercial_version_parent'),
        expect.stringContaining('CREATE TABLE `service_order_item_commercial_lines`'),
        expect.stringContaining('CREATE TABLE `service_order_agreement_items`'),
        expect.stringContaining('DROP FOREIGN KEY `FK_ebc0fdb58bf8ddceedeb3e529f6`'),
        expect.stringContaining('ADD `service_order_item_id` bigint UNSIGNED NOT NULL'),
        expect.stringContaining('FK_service_order_diagnosis_item'),
      ]),
    );
    const joined = executed.join('\n');
    expect(joined).not.toMatch(/DELETE FROM `(?:clients|users|products|sales|service_order_inbox_messages)`/);
  });

  it('protege también el rollback que elimina las tablas nuevas', async () => {
    delete process.env.ALLOW_SERVICE_ORDER_DATA_RESET;
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await expect(new MultiEquipmentServiceOrderFoundation1785790800000().down(queryRunner)).rejects.toThrow(
      'ALLOW_SERVICE_ORDER_DATA_RESET=true',
    );
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
