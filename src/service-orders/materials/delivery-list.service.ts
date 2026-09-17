import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { User } from '../../users/entities/user.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import {
  MaterialAllocation,
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialReconciliation,
} from './material.entity';

export class DeliveryListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) technicianId?: number;
  @IsOptional() @IsIn(['ORDER', 'MANUAL']) type?: 'ORDER' | 'MANUAL';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export function manualDeliveryQuantity(
  serialized: boolean,
  quantity: number,
  serialIds: number[],
) {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0)
    throw new BadRequestException('La cantidad debe ser mayor que cero');
  if (!serialized && serialIds.length)
    throw new BadRequestException('El producto no utiliza series');
  if (serialized && !Number.isInteger(value))
    throw new BadRequestException(
      'La cantidad de un producto serializado debe ser entera',
    );
  if (serialized && serialIds.length !== value)
    throw new BadRequestException(
      'Selecciona exactamente las series correspondientes a cada unidad',
    );
  return value;
}
export function deliveryDateRange(from?: string, to?: string) {
  for (const value of [from, to]) {
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Fecha inválida');
  }
  if (from && to && from > to)
    throw new BadRequestException('Desde no puede ser posterior a Hasta');
  const end = to ? new Date(`${to}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + 1);
  return {
    from: from ? `${from} 00:00:00` : undefined,
    until: end ? `${end.toISOString().slice(0, 10)} 00:00:00` : undefined,
  };
}
export function deliveryStatus(
  lines: MaterialDeliveryLine[],
  valid: boolean,
  allocations: MaterialAllocation[],
) {
  const active = lines.filter(
    (line) => Number(line.quantity) > Number(line.returnedQuantity),
  );
  if (!active.length) return 'RETURNED';
  if (active.every((line) => !!line.saleId)) return 'SOLD';
  if (
    valid &&
    active.every(
      (line) =>
        allocations
          .filter((a) => Number(a.deliveryLineId) === Number(line.id))
          .reduce((sum, a) => sum + Number(a.quantity), 0) ===
        Number(line.quantity) - Number(line.returnedQuantity),
    )
  )
    return 'CONFIRMED';
  return 'PENDING';
}
@Injectable()
export class DeliveryListService {
  constructor(private readonly ds: DataSource) {}
  async technicians() {
    const active = await this.ds
      .getRepository(User)
      .createQueryBuilder('technician')
      .innerJoin('technician.roles', 'role')
      .select('technician.id', 'id')
      .addSelect('technician.name', 'name')
      .where('technician.isActive = :active', { active: true })
      .andWhere('technician.deletedAt IS NULL')
      .andWhere('LOWER(role.name) IN (:...roles)', {
        roles: ['technician', 'tecnico'],
      })
      .distinct(true)
      .getRawMany();
    const historical = await this.ds
      .getRepository(MaterialDelivery)
      .createQueryBuilder('delivery')
      .leftJoin(User, 'technician', 'technician.id = delivery.technicianId')
      .select('delivery.technicianId', 'id')
      .addSelect('technician.name', 'name')
      .distinct(true)
      .orderBy('technician.name', 'ASC')
      .getRawMany();
    const activeIds = new Set(active.map((row) => Number(row.id)));
    const values = new Map<number, string>();
    for (const row of [...active, ...historical])
      values.set(Number(row.id), row.name || `Técnico #${row.id}`);
    return [...values]
      .map(([id, name]) => ({
        id,
        name,
        canReceiveManual: activeIds.has(id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  async list(query: DeliveryListQuery) {
    const { from, until } = deliveryDateRange(query.from, query.to);
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const builder = this.ds
      .getRepository(MaterialDelivery)
      .createQueryBuilder('delivery')
      .leftJoin('delivery.item', 'item')
      .leftJoin('item.serviceOrder', 'serviceOrder')
      .leftJoin(User, 'technician', 'technician.id = delivery.technicianId')
      .leftJoin(User, 'issuer', 'issuer.id = delivery.actorId');
    if (query.technicianId)
      builder.andWhere('delivery.technicianId = :technicianId', {
        technicianId: query.technicianId,
      });
    if (query.type)
      builder.andWhere('delivery.type = :type', { type: query.type });
    if (from) builder.andWhere('delivery.createdAt >= :from', { from });
    if (until) builder.andWhere('delivery.createdAt < :until', { until });
    const total = await builder.getCount();
    const rows = await builder
      .select('delivery.id', 'id')
      .addSelect('delivery.type', 'type')
      .addSelect('delivery.notes', 'notes')
      .addSelect('delivery.serviceOrderId', 'orderId')
      .addSelect('delivery.itemId', 'itemId')
      .addSelect('delivery.technicianId', 'technicianId')
      .addSelect('delivery.createdAt', 'createdAt')
      .addSelect('serviceOrder.code', 'orderCode')
      .addSelect('item.code', 'itemCode')
      .addSelect('item.brand', 'brand')
      .addSelect('item.model', 'model')
      .addSelect('technician.name', 'technicianName')
      .addSelect('issuer.name', 'issuerName')
      .orderBy('delivery.createdAt', 'DESC')
      .addOrderBy('delivery.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();
    if (!rows.length) return { data: [], total, page, limit };
    const itemIds = [
      ...new Set(rows.map((row) => Number(row.itemId)).filter(Boolean)),
    ];
    const [lines, reconciliations, versions] = await Promise.all([
      this.ds.getRepository(MaterialDeliveryLine).find({
        where: { deliveryId: In(rows.map((row) => Number(row.id))) },
        relations: ['commercialLine'],
        order: { id: 'ASC' },
      }),
      itemIds.length
        ? this.ds
            .getRepository(MaterialReconciliation)
            .find({ where: { itemId: In(itemIds) } })
        : Promise.resolve([]),
      itemIds.length
        ? this.ds
            .getRepository(ServiceOrderItemCommercialVersion)
            .createQueryBuilder('version')
            .select('version.serviceOrderItemId', 'itemId')
            .addSelect('MAX(version.id)', 'versionId')
            .where('version.serviceOrderItemId IN (:...itemIds)', { itemIds })
            .andWhere("version.status = 'ACCEPTED'")
            .groupBy('version.serviceOrderItemId')
            .getRawMany()
        : Promise.resolve([]),
    ]);
    return {
      total,
      page,
      limit,
      data: rows.map((row) => {
        const entries = lines.filter(
          (line) => Number(line.deliveryId) === Number(row.id),
        );
        const reconciliation = reconciliations.find(
          (value) => Number(value.itemId) === Number(row.itemId),
        );
        const currentVersion = versions.find(
          (value) => Number(value.itemId) === Number(row.itemId),
        );
        return {
          ...row,
          id: Number(row.id),
          type: row.type || 'ORDER',
          orderId: row.orderId ? Number(row.orderId) : null,
          itemId: row.itemId ? Number(row.itemId) : null,
          technicianId: Number(row.technicianId),
          technicianName: row.technicianName || `Técnico #${row.technicianId}`,
          status:
            row.type === 'MANUAL'
              ? 'IN_CUSTODY'
              : deliveryStatus(
                  entries,
                  !!reconciliation?.valid &&
                    Number(reconciliation.versionId) ===
                      Number(currentVersion?.versionId),
                  reconciliation?.allocations ?? [],
                ),
          lines: entries.map((line) => ({
            id: line.id,
            productName:
              line.productNameSnapshot ||
              line.commercialLine?.catalogNameSnapshot ||
              `Producto #${line.productId}`,
            quantity: Number(line.quantity),
            returnedQuantity: Number(line.returnedQuantity),
            serialCode: line.serialCode,
            saleId: line.saleId,
          })),
        };
      }),
    };
  }
}
