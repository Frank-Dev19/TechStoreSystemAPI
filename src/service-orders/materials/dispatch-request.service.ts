import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { MovementTypeEnum } from '../../inventory/dto/movement.dto';
import { Product } from '../../inventory/entities/product.entity';
import { Serial } from '../../inventory/entities/serial.entity';
import { MovementsService } from '../../inventory/services/movements.service';
import { User } from '../../users/entities/user.entity';
import { WarrantiesService } from '../../warranties/warranties.service';
import {
  CreateInternalSupplyRequestDto,
  FulfillDispatchRequestDto,
} from './dispatch-request.dto';
import { DispatchRequest } from './dispatch-request.entity';
import {
  assertDispatchCanBeConfirmed,
  assertDispatchCanBeFulfilled,
  DispatchRequestStatus,
  DispatchRequestType,
  statusAfterFulfillment,
} from './dispatch-request.policy';
import { manualDeliveryQuantity } from './delivery-list.service';
import {
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialOperation,
} from './material.entity';

type QueueQuery = {
  page?: number | string;
  limit?: number | string;
  type?: string;
  status?: string;
  technicianId?: number | string;
  search?: string;
};

@Injectable()
export class DispatchRequestService {
  constructor(
    private readonly ds: DataSource,
    private readonly movements: MovementsService,
    private readonly warranties: WarrantiesService,
  ) {}

  async createInternal(dto: CreateInternalSupplyRequestDto, technicianId: number) {
    const reason = dto.reason.trim();
    if (reason.length < 5) throw new BadRequestException('Explica el motivo de la solicitud');
    const [technician, product] = await Promise.all([
      this.ds.manager.findOne(User, { where: { id: technicianId, isActive: true } }),
      this.ds.manager.findOne(Product, { where: { id: dto.productId } }),
    ]);
    if (!technician) throw new ForbiddenException('Técnico no identificado');
    if (!product) throw new NotFoundException('Producto no encontrado');
    return this.ds.manager.save(
      DispatchRequest,
      this.ds.manager.create(DispatchRequest, {
        type: DispatchRequestType.INTERNAL_SUPPLY,
        status: DispatchRequestStatus.PENDING,
        technicianId,
        requestedBy: technicianId,
        productId: product.id,
        quantity: dto.quantity,
        reason,
        serviceOrderId: null,
        serviceOrderItemId: null,
        warrantyClaimId: null,
        originalSerialId: null,
        originalUnitCondition: null,
        deliveryId: null,
        resolvedBy: null,
        resolutionNote: null,
        deliveredAt: null,
        confirmedAt: null,
        rejectedAt: null,
      }),
    );
  }

  async list(query: QueueQuery, viewerTechnicianId?: number) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
    if (query.type === 'ORDER') return this.listOrderQueue(page, limit, query.technicianId);

    const qb = this.ds
      .getRepository(DispatchRequest)
      .createQueryBuilder('request')
      .leftJoin(User, 'technician', 'technician.id = request.technicianId')
      .leftJoin(Product, 'product', 'product.id = request.productId')
      .select([
        'request.id AS id',
        'request.type AS type',
        'request.status AS status',
        'request.technicianId AS technicianId',
        'technician.name AS technicianName',
        'request.productId AS productId',
        'product.name AS productName',
        'product.sku AS productSku',
        'product.isSerialized AS isSerialized',
        'product.managesExpiration AS managesExpiration',
        'request.quantity AS quantity',
        'request.reason AS reason',
        'request.serviceOrderId AS serviceOrderId',
        'request.serviceOrderItemId AS serviceOrderItemId',
        'request.warrantyClaimId AS warrantyClaimId',
        'request.deliveryId AS deliveryId',
        'request.createdAt AS createdAt',
      ])
      .orderBy('request.createdAt', 'DESC');
    if (query.type && Object.values(DispatchRequestType).includes(query.type as DispatchRequestType)) {
      qb.andWhere('request.type = :type', { type: query.type });
    }
    if (query.status && Object.values(DispatchRequestStatus).includes(query.status as DispatchRequestStatus)) {
      qb.andWhere('request.status = :status', { status: query.status });
    }
    const technicianId = viewerTechnicianId || Number(query.technicianId) || 0;
    if (technicianId) qb.andWhere('request.technicianId = :technicianId', { technicianId });
    const total = await qb.getCount();
    const data = await qb.offset((page - 1) * limit).limit(limit).getRawMany();
    return { data, total, page, limit };
  }

  async listTechnicianHistory(query: QueueQuery, technicianId: number) {
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(query.limit) || 10)));
    const type = String(query.type ?? '').trim();
    const status = String(query.status ?? '').trim();
    const search = String(query.search ?? '').trim();
    const includeDispatchRequests = !type || type !== 'ORDER';
    const includeOrderMaterials = !type || type === 'ORDER';
    const rows: Array<Record<string, unknown>> = [];

    if (includeDispatchRequests) {
      const requests = this.ds
        .getRepository(DispatchRequest)
        .createQueryBuilder('request')
        .leftJoin(Product, 'product', 'product.id = request.productId')
        .leftJoin('service_orders', 'orders', 'orders.id = request.service_order_id')
        .leftJoin('service_order_items', 'item', 'item.id = request.service_order_item_id')
        .select([
          'request.id AS id',
          'request.type AS type',
          'request.status AS status',
          'request.productId AS productId',
          'product.name AS productName',
          'product.sku AS productSku',
          'request.quantity AS quantity',
          'request.reason AS reason',
          'request.serviceOrderId AS serviceOrderId',
          'orders.code AS orderCode',
          'request.serviceOrderItemId AS serviceOrderItemId',
          'item.code AS itemCode',
          'request.deliveryId AS deliveryId',
          'request.deliveredAt AS deliveredAt',
          'request.confirmedAt AS confirmedAt',
          'request.createdAt AS createdAt',
        ])
        .where('request.technicianId = :technicianId', { technicianId });
      if (type && Object.values(DispatchRequestType).includes(type as DispatchRequestType)) {
        requests.andWhere('request.type = :type', { type });
      }
      if (status && Object.values(DispatchRequestStatus).includes(status as DispatchRequestStatus)) {
        requests.andWhere('request.status = :status', { status });
      }
      if (search) {
        requests.andWhere(
          '(product.name LIKE :search OR product.sku LIKE :search OR request.reason LIKE :search OR orders.code LIKE :search OR item.code LIKE :search)',
          { search: `%${search}%` },
        );
      }
      rows.push(...await requests.getRawMany());
    }

    if (includeOrderMaterials) {
      const orders = this.ds
        .createQueryBuilder()
        .select([
          'line.id AS id',
          "'ORDER' AS type",
          "CASE WHEN CAST(line.quantity AS DECIMAL(14,4)) <= COALESCE(SUM(delivered.quantity), 0) THEN 'CONFIRMED' ELSE 'PENDING' END AS status",
          'line.product_id AS productId',
          'line.catalog_name_snapshot AS productName',
          'line.catalog_code_snapshot AS productSku',
          'line.quantity AS quantity',
          "'Material autorizado por el cliente' AS reason",
          'service_order.id AS serviceOrderId',
          'service_order.code AS orderCode',
          'item.id AS serviceOrderItemId',
          'item.code AS itemCode',
          'MAX(delivery.id) AS deliveryId',
          'MAX(delivery.createdAt) AS deliveredAt',
          'MAX(delivery.createdAt) AS confirmedAt',
          'version.accepted_at AS createdAt',
        ])
        .from('service_order_item_commercial_lines', 'line')
        .innerJoin(
          'service_order_item_commercial_versions',
          'version',
          'version.id = line.commercial_version_id AND version.status = :accepted',
          { accepted: 'ACCEPTED' },
        )
        .innerJoin('service_order_items', 'item', 'item.id = version.service_order_item_id')
        .innerJoin('service_orders', 'service_order', 'service_order.id = item.service_order_id')
        .leftJoin('material_delivery_lines', 'delivered', 'delivered.commercialLineId = line.id')
        .leftJoin('material_deliveries', 'delivery', "delivery.id = delivered.deliveryId AND delivery.type = 'ORDER'")
        .where('line.type = :productType', { productType: 'PRODUCT' })
        .andWhere('service_order.assigned_to_technician_id = :technicianId', { technicianId })
        .groupBy('line.id');
      if (search) {
        orders.andWhere(
          '(line.catalog_name_snapshot LIKE :search OR line.catalog_code_snapshot LIKE :search OR service_order.code LIKE :search OR item.code LIKE :search)',
          { search: `%${search}%` },
        );
      }
      const orderRows = await orders.getRawMany();
      rows.push(...orderRows.filter((row) => !status || row.status === status));
    }

    rows.sort((left, right) => {
      const leftDate = new Date(String(left.createdAt ?? 0)).getTime();
      const rightDate = new Date(String(right.createdAt ?? 0)).getTime();
      return rightDate - leftDate;
    });
    const total = rows.length;
    return { data: rows.slice((page - 1) * limit, page * limit), total, page, limit };
  }

  async summary() {
    const rows = await this.ds
      .getRepository(DispatchRequest)
      .createQueryBuilder('request')
      .select('request.type', 'type')
      .addSelect('COUNT(*)', 'total')
      .where('request.status = :status', { status: DispatchRequestStatus.PENDING })
      .groupBy('request.type')
      .getRawMany<{ type: DispatchRequestType; total: string }>();
    const counts = {
      order: await this.countOrderQueue(),
      internal: 0,
      warranty: 0,
    };
    for (const row of rows) {
      if (row.type === DispatchRequestType.INTERNAL_SUPPLY) counts.internal = Number(row.total);
      if (row.type === DispatchRequestType.WARRANTY_REPLACEMENT) counts.warranty = Number(row.total);
    }
    return { ...counts, total: counts.order + counts.internal + counts.warranty };
  }

  options(productId: number) {
    return this.ds.manager.transaction((em) => this.loadOptions(em, productId));
  }

  async fulfill(id: number, dto: FulfillDispatchRequestDto, actorId: number) {
    return this.ds.transaction('READ COMMITTED', async (em) => {
      const fingerprint = createHash('sha256').update(JSON.stringify({ id, actorId, dto })).digest('hex');
      const previous = await em.findOneBy(MaterialOperation, { requestKey: dto.requestKey });
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ConflictException('La clave de operación ya fue usada con otros datos');
        return previous.result;
      }
      const request = await em.findOne(DispatchRequest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Solicitud no encontrada');
      assertDispatchCanBeFulfilled(request.status);
      const product = await em.findOne(Product, { where: { id: request.productId }, lock: { mode: 'pessimistic_write' } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const serialIds = dto.serialIds ?? [];
      const quantity = manualDeliveryQuantity(product.isSerialized, Number(request.quantity), serialIds);
      if (product.isSerialized && quantity !== Number(request.quantity)) {
        throw new BadRequestException(`Selecciona ${Number(request.quantity)} serie(s)`);
      }
      if (product.managesExpiration && !dto.lotId) throw new BadRequestException(`${product.name} requiere seleccionar un lote`);
      const deliveryType = request.type === DispatchRequestType.WARRANTY_REPLACEMENT
        ? 'WARRANTY_REPLACEMENT'
        : 'INTERNAL_REQUEST';
      const delivery = await em.save(MaterialDelivery, em.create(MaterialDelivery, {
        type: deliveryType,
        serviceOrderId: request.serviceOrderId,
        itemId: request.serviceOrderItemId,
        versionId: null,
        technicianId: request.technicianId,
        actorId,
        notes: dto.note?.trim() || request.reason,
        dispatchRequestId: request.id,
      }));
      const movement = await this.movements.createMovement({
        type: MovementTypeEnum.OUT,
        product_id: product.id,
        qty: quantity,
        lot_id: dto.lotId,
        serial_ids: serialIds,
        reason_code: request.type === DispatchRequestType.WARRANTY_REPLACEMENT
          ? 'WARRANTY_REPLACEMENT'
          : 'TECHNICIAN_SUPPLY_ISSUE',
        source_doc_type: request.type === DispatchRequestType.WARRANTY_REPLACEMENT
          ? 'WARRANTY_DISPATCH'
          : 'INTERNAL_DISPATCH',
        source_doc_id: String(request.id),
        notes: dto.note?.trim() || request.reason,
      }, String(actorId), em);
      const serials = serialIds.length ? await em.findBy(Serial, { id: In(serialIds) }) : [];
      if (product.isSerialized) {
        for (const serial of serials) {
          await this.saveLine(em, delivery, product, movement.id, movement.unitCost, 1, serial, dto.lotId);
        }
      } else {
        await this.saveLine(em, delivery, product, movement.id, movement.unitCost, quantity, null, dto.lotId);
      }
      request.status = statusAfterFulfillment(request.type);
      request.deliveryId = delivery.id;
      request.resolvedBy = actorId;
      request.resolutionNote = dto.note?.trim() || null;
      request.deliveredAt = new Date();
      if (request.status === DispatchRequestStatus.CONFIRMED) request.confirmedAt = request.deliveredAt;
      await em.save(request);
      if (request.type === DispatchRequestType.WARRANTY_REPLACEMENT) {
        await this.warranties.markReplacementDelivered(em, request.warrantyClaimId!, actorId);
      }
      const result = { requestId: request.id, deliveryId: delivery.id, code: `DP-${delivery.id}`, status: request.status };
      await em.save(MaterialOperation, em.create(MaterialOperation, {
        requestKey: dto.requestKey,
        fingerprint,
        action: 'dispatch-request-fulfill',
        actorId,
        result,
      }));
      return result;
    });
  }

  async reject(id: number, reason: string, actorId: number) {
    return this.ds.transaction(async (em) => {
      const request = await em.findOne(DispatchRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request) throw new NotFoundException('Solicitud no encontrada');
      assertDispatchCanBeFulfilled(request.status);
      if (request.type === DispatchRequestType.WARRANTY_REPLACEMENT) {
        throw new BadRequestException('Un reemplazo de garantía debe resolverse desde el reclamo');
      }
      request.status = DispatchRequestStatus.REJECTED;
      request.resolvedBy = actorId;
      request.resolutionNote = reason.trim();
      request.rejectedAt = new Date();
      return em.save(request);
    });
  }

  async confirmReplacement(id: number, technicianId: number) {
    return this.ds.transaction(async (em) => {
      const request = await em.findOne(DispatchRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request) throw new NotFoundException('Solicitud no encontrada');
      if (request.technicianId !== technicianId) throw new ForbiddenException('La solicitud pertenece a otro técnico');
      if (request.status === DispatchRequestStatus.CONFIRMED) return request;
      assertDispatchCanBeConfirmed(request.type, request.status);
      await this.warranties.confirmReplacement(em, request.warrantyClaimId!, technicianId);
      request.status = DispatchRequestStatus.CONFIRMED;
      request.confirmedAt = new Date();
      return em.save(request);
    });
  }

  private async loadOptions(em: EntityManager, productId: number) {
    const product = await em.findOne(Product, { where: { id: productId }, relations: ['baseUnit'] });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const stocks = await em.query(
      'SELECT s.lotId AS id, l.lotCode AS lotCode, s.qtyOnHand AS availableQuantity FROM stock s LEFT JOIN lots l ON l.id = s.lotId WHERE s.productId = ? AND s.qtyOnHand > 0',
      [productId],
    );
    const serials = product.isSerialized ? await em.find(Serial, {
      where: { productId, status: 'IN_STOCK', condition: 'USABLE' },
      order: { serialCode: 'ASC' },
    }) : [];
    return {
      product: { id: product.id, name: product.name, sku: product.sku, isSerialized: product.isSerialized, managesExpiration: product.managesExpiration, unit: product.baseUnit?.abbreviation || product.baseUnit?.name || 'unidad' },
      availableQuantity: stocks.reduce((sum: number, row: { availableQuantity: string }) => sum + Number(row.availableQuantity), 0),
      lots: stocks.filter((row: { id: number | null }) => row.id).map((row: { id: number; lotCode: string; availableQuantity: string }) => ({ ...row, availableQuantity: Number(row.availableQuantity) })),
      serials: serials.map((serial) => ({ id: serial.id, serialCode: serial.serialCode, lotId: serial.lotId ?? null })),
    };
  }

  private async saveLine(
    em: EntityManager,
    delivery: MaterialDelivery,
    product: Product,
    movementId: number,
    unitCost: number,
    quantity: number,
    serial: Serial | null,
    lotId?: number,
  ) {
    await em.save(MaterialDeliveryLine, em.create(MaterialDeliveryLine, {
      deliveryId: delivery.id,
      itemId: delivery.itemId,
      commercialLineId: null,
      productId: product.id,
      productNameSnapshot: product.name,
      lotId: serial?.lotId ?? lotId ?? null,
      serialId: serial?.id ?? null,
      serialCode: serial?.serialCode ?? null,
      quantity,
      returnedQuantity: 0,
      unitCost,
      movementId,
      saleId: null,
    }));
  }

  private async listOrderQueue(page: number, limit: number, technicianValue?: number | string) {
    const technicianId = Number(technicianValue) || 0;
    const qb = this.ds
      .createQueryBuilder()
      .select([
        'line.id AS id',
        "'ORDER' AS type",
        "'PENDING' AS status",
        'orders.id AS serviceOrderId',
        'orders.code AS orderCode',
        'item.id AS serviceOrderItemId',
        'item.code AS itemCode',
        'orders.assigned_to_technician_id AS technicianId',
        'technician.name AS technicianName',
        'line.product_id AS productId',
        'line.catalog_name_snapshot AS productName',
        'line.catalog_code_snapshot AS productSku',
        'line.quantity AS quantity',
        'version.accepted_at AS createdAt',
      ])
      .from('service_order_item_commercial_lines', 'line')
      .innerJoin('service_order_item_commercial_versions', 'version', 'version.id = line.commercial_version_id AND version.status = :accepted', { accepted: 'ACCEPTED' })
      .innerJoin('service_order_items', 'item', 'item.id = version.service_order_item_id')
      .innerJoin('service_orders', 'orders', 'orders.id = item.service_order_id')
      .leftJoin('users', 'technician', 'technician.id = orders.assigned_to_technician_id')
      .leftJoin('material_delivery_lines', 'delivered', 'delivered.commercialLineId = line.id')
      .where('line.type = :productType', { productType: 'PRODUCT' })
      .groupBy('line.id')
      .having('CAST(line.quantity AS DECIMAL(14,4)) > COALESCE(SUM(delivered.quantity), 0)')
      .orderBy('version.acceptedAt', 'ASC');
    if (technicianId) qb.andWhere('orders.assigned_to_technician_id = :technicianId', { technicianId });
    const all = await qb.getRawMany();
    return { data: all.slice((page - 1) * limit, page * limit), total: all.length, page, limit };
  }

  private async countOrderQueue(): Promise<number> {
    return (await this.listOrderQueue(1, 100000)).total;
  }
}
