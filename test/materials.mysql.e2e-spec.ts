import { DeliveryListService } from '../src/service-orders/materials/delivery-list.service';
import 'reflect-metadata';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import mysql from 'mysql2/promise';
import { MaterialsService } from '../src/service-orders/materials/materials.service';
import { MovementsService } from '../src/inventory/services/movements.service';
import {
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialOperation,
  MaterialReconciliation,
  MaterialReturn,
} from '../src/service-orders/materials/material.entity';
import { SerialConditionEvent } from '../src/inventory/entities/serial-condition-event.entity';
import { Product } from '../src/inventory/entities/product.entity';
import { Serial } from '../src/inventory/entities/serial.entity';
import { Stock } from '../src/inventory/entities/stock.entity';
import { Lot } from '../src/inventory/entities/lot.entity';
import { Movement } from '../src/inventory/entities/movement.entity';
import { MovementSerial } from '../src/inventory/entities/movement-serial.entity';
import { ServiceOrder } from '../src/service-orders/entities/service-order.entity';
import { ServiceOrderItem } from '../src/service-orders/entities/service-order-item.entity';
import { ServiceOrderItemCommercialVersion } from '../src/service-orders/entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialLine } from '../src/service-orders/entities/service-order-item-commercial-line.entity';
import { ServiceOrderAgreement } from '../src/service-orders/service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementItem } from '../src/service-orders/service-agreements/entities/service-agreement-item.entity';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/roles/entities/role.entity';
import { Category } from '../src/inventory/entities/category.entity';
import { Unit } from '../src/inventory/entities/unit.entity';
import {
  prepareMaterialSale,
  claimMaterialSale,
} from '../src/service-orders/materials/material-sale';
import { InternalMaterialDeliveries1788566400000 } from '../src/database/migrations/1788566400000-InternalMaterialDeliveries';
import { ManualTechnicianDeliveries1789516800000 } from '../src/database/migrations/1789516800000-ManualTechnicianDeliveries';
import { ManualDeliveryService } from '../src/service-orders/materials/manual-delivery.service';
import { SalesService } from '../src/sales/services/sales.service';
import { SalesInventoryService } from '../src/sales/services/sales-inventory.service';
import { StockService } from '../src/inventory/services/stock.service';
import { Client } from '../src/clients/entities/client.entity';
import { DocumentType as ClientDocumentType } from '../src/catalogs/document-types/entities/document-type.entity';
import { Sale } from '../src/sales/entities/sale.entity';
import { SaleItem } from '../src/sales/entities/sale-item.entity';
import { SalePayment } from '../src/sales/entities/sale-payment.entity';
import { SaleLineDiscount } from '../src/sales/entities/sale-line-discount.entity';
import { SaleComboItem } from '../src/sales/entities/sale-combo-item.entity';
import { CashRegister } from '../src/sales/entities/cash-register.entity';
import { CashFlowTransaction } from '../src/sales/entities/cash-flow-transaction.entity';
import { DocumentSeries } from '../src/sales/entities/document-series.entity';
import { ServiceOrderSaleLink } from '../src/service-orders/entities/service-order-sale-link.entity';

// Opt-in and hard-coded isolated database: never reads the application .env.
const suite =
  process.env.MATERIAL_MYSQL_TEST === '1' ? describe : describe.skip;
suite('Internal deliveries on isolated MySQL', () => {
  let ds: DataSource;
  let materials: MaterialsService;
  let manualDeliveries: ManualDeliveryService;
  let sales: SalesService;
  const key = () => randomUUID();
  const issue = (serialId = 1, orderId = 1) =>
    materials.issue(
      orderId,
      orderId,
      {
        requestKey: key(),
        versionId: orderId,
        lines: [
          { commercialLineId: orderId, quantity: 1, serialIds: [serialId] },
        ],
      },
      1,
    );

  beforeAll(async () => {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
    });
    await connection.query(
      'CREATE DATABASE IF NOT EXISTS techstore_materials_test',
    );
    await connection.end();
    ds = new DataSource({
      type: 'mysql',
      host: '127.0.0.1',
      port: 3307,
      username: 'root',
      database: 'techstore_materials_test',
      entities: [path.join(__dirname, '../src/**/*.entity.ts')],
      synchronize: true,
      dropSchema: true,
    });
    await ds.initialize();
    // Exercise the versioned migration as well as entity metadata.
    const runner = ds.createQueryRunner();
    await runner.connect();
    const migration = new InternalMaterialDeliveries1788566400000();
    await migration.down(runner);
    await migration.up(runner);
    await new ManualTechnicianDeliveries1789516800000().up(runner);
    await runner.release();
    const movements = new MovementsService(
      ds,
      ds.getRepository(Movement),
      ds.getRepository(Product),
      ds.getRepository(Stock),
      ds.getRepository(Lot),
      ds.getRepository(Serial),
      ds.getRepository(MovementSerial),
    );
    materials = new MaterialsService(ds, movements);
    manualDeliveries = new ManualDeliveryService(ds, movements);
    const stock = new StockService(
      ds.getRepository(Stock),
      ds.getRepository(Product),
      ds.getRepository(Lot),
    );
    const inventory = new SalesInventoryService(
      movements,
      stock,
      ds.getRepository(Product),
      ds.getRepository(Lot),
      ds.getRepository(Serial),
    );
    sales = new SalesService(
      ds,
      ds.getRepository(Sale),
      ds.getRepository(SaleItem),
      ds.getRepository(SalePayment),
      ds.getRepository(SaleLineDiscount),
      ds.getRepository(SaleComboItem),
      ds.getRepository(Client),
      ds.getRepository(Product),
      ds.getRepository(Lot),
      ds.getRepository(Serial),
      ds.getRepository(Stock),
      ds.getRepository(CashRegister),
      ds.getRepository(CashFlowTransaction),
      ds.getRepository(Movement),
      ds.getRepository(MovementSerial),
      ds.getRepository(ServiceOrder),
      ds.getRepository(ServiceOrderAgreement),
      ds.getRepository(ServiceOrderSaleLink),
      {} as any,
      inventory,
      {} as any,
      {
        reserveNextNumber: async () => ({
          documentSeriesId: 1,
          series: 'B001',
          number: randomUUID().slice(0, 8),
        }),
      } as any,
      {} as any,
      { getIGVRate: async () => 18 } as any,
      {
        issueProductCoveragesForSale: async () => [],
        revokeForSaleCancellation: async () => undefined,
      } as any,
    );
  }, 120000);

  beforeEach(async () => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.query('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const meta of ds.entityMetadatas)
        await runner.query(`DELETE FROM \`${meta.tableName}\``);
      // Fixtures deliberately isolate domain behavior from unrelated bootstrap/catalog seeders.
      const insert = async (
        target: EntityTarget<ObjectLiteral>,
        overrides: Record<string, unknown>,
      ) => {
        const meta = ds.getMetadata(target);
        const values: Record<string, unknown> = {};
        for (const column of meta.columns) {
          if (
            column.isNullable ||
            column.default !== undefined ||
            column.isGenerated
          )
            continue;
          const type = column.type;
          values[column.databaseName] = column.enum
            ? column.enum[0]
            : type === String || ['varchar', 'text'].includes(String(type))
              ? 'fixture'
              : ['datetime', 'timestamp', 'date'].includes(String(type)) ||
                  type === Date
                ? new Date()
                : type === 'json'
                  ? '{}'
                  : 1;
        }
        for (const [name, value] of Object.entries(overrides)) {
          const column = meta.columns.find(
            (candidate) =>
              candidate.propertyName === name ||
              candidate.databaseName === name,
          );
          if (!column)
            throw new Error(`Unknown fixture field ${meta.name}.${name}`);
          values[column.databaseName] = value;
        }
        const columns = Object.keys(values);
        await runner.query(
          `INSERT INTO \`${meta.tableName}\` (${columns.map((name) => `\`${name}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          Object.values(values),
        );
      };
      await insert(Role, { id: 1, name: 'admin' });
      await insert(ClientDocumentType, {
        id: 1,
        name: 'DNI',
        digits: 8,
        kind: 'PERSON',
      });
      await insert(Client, {
        id: 1,
        name: 'Cliente de prueba',
        documentNumber: '12345678',
        kind: 'PERSON',
      });
      await insert(CashRegister, {
        id: 1,
        companyId: 1,
        status: 'OPEN',
        currentBalance: 0,
        expectedBalance: 0,
        totalCash: 0,
      });
      await insert(DocumentSeries, {
        id: 1,
        companyId: 1,
        documentType: 'BOLETA',
        code: 'B001',
      });
      await insert(Role, { id: 2, name: 'technician' });
      await insert(User, {
        id: 1,
        email: 'admin@fixture.invalid',
        name: 'Admin',
      });
      await insert(User, {
        id: 2,
        email: 'tech@fixture.invalid',
        name: 'Tech',
      });
      await runner.query(
        'INSERT INTO users_roles_roles (usersId,rolesId) VALUES (1,1),(2,2)',
      );
      await insert(Category, { id: 1, name: 'Parts' });
      await insert(Unit, { id: 1, name: 'Unit', abbreviation: 'NIU' });
      await insert(Product, {
        id: 1,
        sku: 'RAM',
        name: 'RAM',
        isSerialized: 1,
        managesExpiration: 0,
      });
      await insert(Product, {
        id: 2,
        sku: 'PASTE',
        name: 'Pasta térmica',
        isSerialized: 0,
        managesExpiration: 0,
      });
      for (const id of [1, 2, 3])
        await insert(Serial, {
          id,
          productId: 1,
          serialCode: `RAM-${id}`,
          status: 'IN_STOCK',
          condition: 'USABLE',
        });
      await insert(Stock, {
        id: 1,
        productId: 1,
        qtyOnHand: 3,
        avgUnitCost: 20,
        totalCost: 60,
      });
      await insert(Stock, {
        id: 2,
        productId: 2,
        qtyOnHand: 10,
        avgUnitCost: 2,
        totalCost: 20,
      });
      for (const id of [1, 2]) {
        await insert(ServiceOrder, {
          id,
          code: `TEST-${id}`,
          assignedToTechnicianId: 2,
          clientId: 1,
          economicStatus: 'PENDIENTE',
          operativeStatus: 'LISTA_PARA_ENTREGA',
          technicalStatus: 'RESUELTA',
        });
        await insert(ServiceOrderItem, {
          id,
          service_order_id: id,
          code: `TEST-${id}-01`,
          position: 1,
          technicalStatus: 'EN_EJECUCION',
        });
        await insert(ServiceOrderItemCommercialVersion, {
          id,
          service_order_item_id: id,
          version_number: 1,
          status: 'ACCEPTED',
          total_amount: 100,
        });
        await insert(ServiceOrderItemCommercialLine, {
          id,
          commercial_version_id: id,
          type: 'PRODUCT',
          product_id: 1,
          quantity: 1,
          unit_price: 100,
          gross_amount: 100,
          net_amount: 100,
        });
        await insert(ServiceOrderAgreement, {
          id,
          service_order_id: id,
          status: 'CONFIRMED',
          total_amount: 100,
        });
        await insert(ServiceOrderAgreementItem, {
          id,
          service_order_agreement_id: id,
          service_order_item_id: id,
          commercial_version_id: id,
        });
      }
    } finally {
      await runner.query('SET FOREIGN_KEY_CHECKS=1');
      await runner.release();
    }
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('lists historical recipients, inclusive date boundaries and stable pages without changing stock', async () => {
    await issue(1, 1);
    await issue(2, 2);
    const deliveries = await ds
      .getRepository(MaterialDelivery)
      .find({ order: { id: 'ASC' } });
    await ds.query(
      'UPDATE material_deliveries SET createdAt = ? WHERE id = ?',
      ['2026-09-13 23:59:59', deliveries[0].id],
    );
    await ds.query(
      'UPDATE material_deliveries SET createdAt = ? WHERE id = ?',
      ['2026-09-14 00:00:00', deliveries[1].id],
    );
    await ds
      .getRepository(ServiceOrder)
      .update(1, { assignedToTechnicianId: 1 });
    const register = new DeliveryListService(ds);
    const result = await register.list({
      technicianId: 2,
      from: '2026-09-13',
      to: '2026-09-13',
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: deliveries[0].id,
        technicianId: 2,
        technicianName: 'Tech',
        orderId: 1,
        status: 'PENDING',
      }),
    );
    expect(result.data[0].lines[0].serialCode).toBe('RAM-1');
    const second = await register.list({ page: 2, limit: 1 });
    expect(second.total).toBe(2);
    expect(second.data[0].id).toBe(deliveries[0].id);
    expect(
      (await register.list({ technicianId: 1, page: 1, limit: 20 })).total,
    ).toBe(0);
    expect(await register.technicians()).toEqual([
      { id: 2, name: 'Tech', canReceiveManual: true },
    ]);
    expect(await ds.getRepository(Movement).count()).toBe(2);
  });

  it('issues once on retry and rejects key reuse with a different payload', async () => {
    const dto = {
      requestKey: key(),
      versionId: 1,
      lines: [{ commercialLineId: 1, quantity: 1, serialIds: [1] }],
    };
    const first = await materials.issue(1, 1, dto, 1);
    expect(await materials.issue(1, 1, dto, 1)).toEqual(first);
    expect(
      Number((await ds.manager.findOneBy(Stock, { id: 1 }))?.qtyOnHand),
    ).toBe(2);
    expect(await ds.getRepository(Movement).count()).toBe(1);
    await expect(
      materials.issue(
        1,
        1,
        { ...dto, lines: [{ ...dto.lines[0], serialIds: [2] }] },
        1,
      ),
    ).rejects.toThrow('clave');
  });

  it('issues a manual consumable to technician custody and lists it by origin', async () => {
    const requestKey = key();
    const dto = {
      requestKey,
      technicianId: 2,
      notes: 'Mantenimientos preventivos',
      lines: [{ productId: 2, quantity: 4 }],
    };
    const created = await manualDeliveries.create(dto, 1);
    expect(await manualDeliveries.create(dto, 1)).toEqual(created);
    expect(
      Number((await ds.manager.findOneBy(Stock, { id: 2 }))?.qtyOnHand),
    ).toBe(6);
    expect(
      await ds
        .getRepository(Movement)
        .countBy({ reasonCode: 'TECHNICIAN_SUPPLY_ISSUE' }),
    ).toBe(1);
    const register = await new DeliveryListService(ds).list({
      type: 'MANUAL',
      page: 1,
      limit: 20,
    });
    expect(register.total).toBe(1);
    expect(register.data[0]).toEqual(
      expect.objectContaining({
        type: 'MANUAL',
        orderId: null,
        technicianId: 2,
        status: 'IN_CUSTODY',
      }),
    );
    expect(register.data[0].lines[0]).toEqual(
      expect.objectContaining({ productName: 'Pasta térmica', quantity: 4 }),
    );
  });

  it('allows exactly one competing order to take the same serial', async () => {
    const results = await Promise.allSettled([issue(1, 1), issue(1, 2)]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await ds.getRepository(MaterialDelivery).count()).toBe(1);
    expect(
      Number((await ds.manager.findOneBy(Stock, { id: 1 }))?.qtyOnHand),
    ).toBe(2);
  });

  it('returns a faulty serial, blocks reuse, reviews as admin, and inherits the replacement without another OUT', async () => {
    await issue();
    const line = await ds
      .getRepository(MaterialDeliveryLine)
      .findOneByOrFail({ itemId: 1 });
    const dto = {
      requestKey: key(),
      deliveryLineId: line.id,
      quantity: 1,
      faulty: true,
      reason: 'No reconoce memoria',
    };
    await materials.returnMaterial(1, 1, dto, 1);
    await materials.returnMaterial(1, 1, dto, 1);
    expect((await ds.manager.findOneBy(Serial, { id: 1 }))?.condition).toBe(
      'UNDER_REVIEW',
    );
    expect(await ds.getRepository(MaterialReturn).count()).toBe(1);
    await expect(issue()).rejects.toThrow();
    await expect(
      materials.review(
        1,
        1,
        1,
        { requestKey: key(), condition: 'UNUSABLE', reason: 'Confirmado' },
        2,
      ),
    ).rejects.toThrow('admin');
    await materials.review(
      1,
      1,
      1,
      { requestKey: key(), condition: 'UNUSABLE', reason: 'Daño confirmado' },
      1,
    );
    expect(await ds.getRepository(SerialConditionEvent).count()).toBe(2);
    expect(await ds.getRepository(Movement).count()).toBe(2);
    await issue(2);
    await materials.reconcile(1, 1, { requestKey: key(), versionId: 1 }, 2);
    const agreement = await ds
      .getRepository(ServiceOrderAgreement)
      .findOneOrFail({ where: { id: 1 }, relations: ['items'] });
    await ds.transaction(async (em) => {
      const sources = await prepareMaterialSale(em, agreement);
      expect(sources.get(1)?.[0].serialCode).toBe('RAM-2');
      expect(sources.get(1)?.[0].unitCost).toBe(20);
      await claimMaterialSale(em, sources, 99);
    });
    expect(await ds.getRepository(Movement).count()).toBe(3);
    await expect(
      ds.transaction((em) => prepareMaterialSale(em, agreement)),
    ).rejects.toThrow('facturado');
  });

  it('blocks missing reconciliation, reduced quantities and technicians of another order', async () => {
    const agreement = await ds
      .getRepository(ServiceOrderAgreement)
      .findOneOrFail({ where: { id: 1 }, relations: ['items'] });
    await expect(
      ds.transaction((em) => prepareMaterialSale(em, agreement)),
    ).rejects.toThrow('materiales');
    await ds.manager.update(ServiceOrderItemCommercialLine, 1, { quantity: 2 });
    await issue();
    await expect(
      materials.reconcile(1, 1, { requestKey: key(), versionId: 1 }, 2),
    ).rejects.toThrow('cotización');
    await ds.manager.update(ServiceOrder, 1, { assignedToTechnicianId: 1 });
    await expect(materials.read(1, 1, 2)).rejects.toThrow('otro técnico');
  });

  it('rejects confirmation before the equipment enters service', async () => {
    await issue();
    await ds.manager.update(ServiceOrderItem, 1, {
      technicalStatus: 'AUTORIZADA_PARA_EJECUCION' as any,
    });
    await expect(
      materials.reconcile(1, 1, { requestKey: key(), versionId: 1 }, 2),
    ).rejects.toThrow('En servicio');
    expect(await ds.getRepository(MaterialReconciliation).count()).toBe(0);
  });

  it('invalidates reconciliation after a fault return and preserves return cost', async () => {
    await issue();
    await materials.reconcile(1, 1, { requestKey: key(), versionId: 1 }, 2);
    const line = await ds
      .getRepository(MaterialDeliveryLine)
      .findOneByOrFail({ itemId: 1 });
    await ds.manager.update(Stock, 1, { avgUnitCost: 99, totalCost: 198 });
    await materials.returnMaterial(
      1,
      1,
      {
        requestKey: key(),
        deliveryLineId: line.id,
        quantity: 1,
        faulty: true,
        reason: 'Falla detectada al probar la pieza',
      },
      1,
    );
    expect(
      (await ds.manager.findOneBy(MaterialReconciliation, { itemId: 1 }))
        ?.valid,
    ).toBe(false);
    const movement = await ds
      .getRepository(Movement)
      .findOneByOrFail({ reasonCode: 'MATERIAL_RETURN' });
    expect(Number(movement.unitCost)).toBe(20);
  });

  it('rejects returns of unused leftovers without creating an inventory movement', async () => {
    await issue();
    const line = await ds
      .getRepository(MaterialDeliveryLine)
      .findOneByOrFail({ itemId: 1 });
    await expect(
      materials.returnMaterial(
        1,
        1,
        {
          requestKey: key(),
          deliveryLineId: line.id,
          quantity: 1,
          faulty: false,
          reason: 'Sobrante',
        },
        1,
      ),
    ).rejects.toThrow('falla de fábrica');
    expect(await ds.getRepository(Movement).count()).toBe(1);
    expect(await ds.getRepository(MaterialReturn).count()).toBe(0);
  });

  it.each(['single', 'grouped'])(
    'creates and cancels a %s service sale without moving the installed stock twice',
    async (route) => {
      await issue(2);
      await materials.reconcile(1, 1, { requestKey: key(), versionId: 1 }, 2);
      const dto = {
        serviceOrderId: 1,
        serviceOrderIds: [1],
        taxpayerCustomerId: 1,
        companyId: 1,
        documentType: 'BOLETA',
        issueDate: '2026-09-05',
        payments: [{ method: 'CASH', amount: 100 }],
      };
      const sale =
        route === 'single'
          ? await sales.createFromServiceOrder(dto, '1')
          : await sales.createFromServiceAgreements(dto as any, '1');
      expect(sale.items[0].materialSources?.[0].serialCode).toBe('RAM-2');
      expect((sale.items[0] as any).serials[0].serialCode).toBe('RAM-2');
      expect(await ds.getRepository(Movement).count()).toBe(1);
      await sales.cancel(sale.id, { reason: 'Prueba' }, '1');
      expect(await ds.getRepository(Movement).count()).toBe(1);
      expect((await ds.manager.findOneBy(Serial, { id: 2 }))?.status).toBe(
        'ISSUED',
      );
      expect(
        Number((await ds.manager.findOneBy(Stock, { id: 1 }))?.qtyOnHand),
      ).toBe(2);
    },
  );

  it('updates stock correctly for two concurrent deliveries of different serials', async () => {
    await Promise.all([issue(1, 1), issue(2, 2)]);
    expect(
      Number((await ds.manager.findOneBy(Stock, { id: 1 }))?.qtyOnHand),
    ).toBe(1);
    expect(
      Number((await ds.manager.findOneBy(Stock, { id: 1 }))?.totalCost),
    ).toBe(20);
  });
});
