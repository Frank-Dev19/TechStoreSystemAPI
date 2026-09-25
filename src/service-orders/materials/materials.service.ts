import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { Product } from '../../inventory/entities/product.entity';
import { Serial } from '../../inventory/entities/serial.entity';
import { Lot } from '../../inventory/entities/lot.entity';
import { SerialConditionEvent } from '../../inventory/entities/serial-condition-event.entity';
import { MovementsService } from '../../inventory/services/movements.service';
import { MovementTypeEnum } from '../../inventory/dto/movement.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialVersionStatus as VersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';
import {
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialOperation,
  MaterialReconciliation,
  MaterialReturn,
  MaterialAllocation,
} from './material.entity';
import {
  MaterialIssueDto,
  MaterialReconcileDto,
  MaterialReturnDto,
  MaterialReviewDto,
} from './material.dto';
import {
  assertMaterialMatch,
  assertMaterialDeliveryStage,
  assertReconciliationStage,
  assertReviewRole,
  assertUsableSerial,
} from './material-policy';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly ds: DataSource,
    private readonly movements: MovementsService,
  ) {}

  private async context(
    em: EntityManager,
    orderId: number,
    itemId: number,
    actorId: number,
    write = false,
  ) {
    const user = await em.findOne(User, {
      where: { id: actorId },
      relations: ['roles'],
    });
    if (!user) throw new ForbiddenException();
    const order = await em.findOne(ServiceOrder, {
      where: { id: orderId },
      ...(write ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (
      isTechnicianScopedRoleSet(user.roles) &&
      Number(order.assignedToTechnicianId) !== actorId
    )
      throw new ForbiddenException('Orden asignada a otro técnico');
    const item = await em.findOneBy(ServiceOrderItem, {
      id: itemId,
      serviceOrderId: orderId,
    });
    if (!item) throw new NotFoundException('Equipo no pertenece a la orden');
    return { order, item, user };
  }

  private async version(em: EntityManager, itemId: number, expected?: number) {
    const version = await em.findOne(ServiceOrderItemCommercialVersion, {
      where: { serviceOrderItemId: itemId, status: VersionStatus.ACCEPTED },
      order: { versionNumber: 'DESC' },
      relations: ['lines', 'lines.product'],
    });
    if (!version || (expected && Number(version.id) !== expected))
      throw new BadRequestException(
        'La cotización aprobada cambió. Actualice el equipo.',
      );
    return version;
  }

  private async invalidate(em: EntityManager, itemId: number) {
    await em.update(MaterialReconciliation, { itemId }, { valid: false });
  }

  private async once(
    em: EntityManager,
    actorId: number,
    action: string,
    payload: { requestKey: string },
    execute: () => Promise<Record<string, unknown>>,
  ) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ actorId, action, payload }))
      .digest('hex');
    const previous = await em.findOneBy(MaterialOperation, {
      requestKey: payload.requestKey,
    });
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ConflictException(
          'La clave de operación ya fue usada con otros datos',
        );
      return previous.result;
    }
    const result = await execute();
    await em.save(
      MaterialOperation,
      em.create(MaterialOperation, {
        requestKey: payload.requestKey,
        fingerprint,
        action,
        actorId,
        result,
      }),
    );
    return result;
  }

  async read(orderId: number, itemId: number, actorId: number) {
    const em = this.ds.manager;
    const { order, item, user } = await this.context(
      em,
      orderId,
      itemId,
      actorId,
    );
    const version = await em.findOne(ServiceOrderItemCommercialVersion, {
      where: { serviceOrderItemId: itemId, status: VersionStatus.ACCEPTED },
      order: { versionNumber: 'DESC' },
      relations: ['lines', 'lines.product'],
    });
    const deliveries = await em.find(MaterialDelivery, {
      where: { itemId },
      order: { id: 'ASC' },
    });
    const lines = await em.find(MaterialDeliveryLine, {
      where: { itemId },
      order: { id: 'ASC' },
    });
    const ids = lines.map((line) => line.id);
    const returns = ids.length
      ? await em.find(MaterialReturn, {
          where: { deliveryLineId: In(ids) },
          order: { id: 'ASC' },
        })
      : [];
    const serialIds = lines.flatMap((line) =>
      line.serialId ? [line.serialId] : [],
    );
    const serials = serialIds.length
      ? await em.findBy(Serial, { id: In(serialIds) })
      : [];
    const conditionHistory = serialIds.length
      ? await em.find(SerialConditionEvent, {
          where: { serialId: In(serialIds) },
          order: { id: 'ASC' },
        })
      : [];
    const reconciliation = await em.findOneBy(MaterialReconciliation, {
      itemId,
    });
    return {
      orderId,
      itemId,
      itemCode: item.code,
      technicianId: order.assignedToTechnicianId,
      version,
      deliveries,
      lines,
      returns,
      serials,
      conditionHistory,
      reconciliation,
      technicalStatus: item.technicalStatus,
      isAdmin: user.roles.some((role) => role.name === 'admin'),
    };
  }

  async available(
    orderId: number,
    itemId: number,
    productId: number,
    actorId: number,
  ) {
    await this.context(this.ds.manager, orderId, itemId, actorId);
    const serials = await this.ds.manager.find(Serial, {
      where: { productId, status: 'IN_STOCK', condition: 'USABLE' },
      order: { serialCode: 'ASC' },
    });
    const lots = await this.ds.manager.find(Lot, {
      where: { productId },
      order: { id: 'DESC' },
    });
    return { serials, lots };
  }

  async issue(
    orderId: number,
    itemId: number,
    dto: MaterialIssueDto,
    actorId: number,
  ) {
    return this.ds.transaction('READ COMMITTED', async (em) => {
      const { order, item } = await this.context(
        em,
        orderId,
        itemId,
        actorId,
        true,
      );
      return this.once(
        em,
        actorId,
        `issue:${orderId}:${itemId}`,
        dto,
        async () => {
          if (item.deliveredAt || item.cancelledAt)
            throw new BadRequestException('El equipo no admite entregas');
          assertMaterialDeliveryStage(item.technicalStatus);
          if (!order.assignedToTechnicianId)
            throw new BadRequestException(
              'Asigne un técnico antes de entregar',
            );
          const version = await this.version(em, itemId, dto.versionId);
          const existing = await em.findBy(MaterialDeliveryLine, { itemId });
          if (existing.some((line) => line.saleId))
            throw new BadRequestException('El material ya fue facturado');
          const delivery = await em.save(
            MaterialDelivery,
            em.create(MaterialDelivery, {
              serviceOrderId: orderId,
              itemId,
              versionId: version.id,
              technicianId: order.assignedToTechnicianId,
              actorId,
            }),
          );
          const issued = [...existing];
          for (const request of [...dto.lines].sort(
            (a, b) => a.commercialLineId - b.commercialLineId,
          )) {
            const commercial = version.lines.find(
              (line) =>
                Number(line.id) === request.commercialLineId &&
                line.type === ServiceOrderCommercialLineType.PRODUCT,
            );
            if (!commercial?.productId)
              throw new BadRequestException(
                'Línea ajena a la cotización aprobada',
              );
            const product = await em.findOne(Product, {
              where: { id: commercial.productId },
              lock: { mode: 'pessimistic_write' },
            });
            if (!product) throw new NotFoundException('Producto no encontrado');
            const authorized = version.lines
              .filter(
                (line) =>
                  line.type === ServiceOrderCommercialLineType.PRODUCT &&
                  Number(line.productId) === Number(product.id),
              )
              .reduce((sum, line) => sum + Number(line.quantity), 0);
            const already = issued
              .filter((line) => Number(line.productId) === Number(product.id))
              .reduce(
                (sum, line) =>
                  sum + Number(line.quantity) - Number(line.returnedQuantity),
                0,
              );
            if (already + request.quantity > authorized + 0.00001)
              throw new BadRequestException(
                'La entrega supera la cantidad autorizada pendiente',
              );
            const selected = request.serialIds?.length
              ? await em.find(Serial, {
                  where: { id: In(request.serialIds) },
                  lock: { mode: 'pessimistic_write' },
                })
              : [];
            if (
              product.isSerialized &&
              (new Set(request.serialIds).size !== request.quantity ||
                selected.length !== request.quantity)
            )
              throw new BadRequestException(
                'Seleccione exactamente las series físicas a entregar',
              );
            if (!product.isSerialized && selected.length)
              throw new BadRequestException('El producto no usa series');
            for (const serial of selected) {
              assertUsableSerial(serial);
              if (
                Number(serial.productId) !== Number(product.id) ||
                (request.lotId && Number(serial.lotId) !== request.lotId)
              )
                throw new BadRequestException('Serie de otro producto o lote');
            }
            if (request.lotId) {
              const lot = await em.findOneBy(Lot, {
                id: request.lotId,
                productId: product.id,
              });
              if (!lot) throw new BadRequestException('Lote de otro producto');
            }
            const units = product.isSerialized
              ? selected.map((serial) => ({
                  quantity: 1,
                  serial,
                  lotId: serial.lotId ?? null,
                }))
              : [
                  {
                    quantity: request.quantity,
                    serial: null,
                    lotId: request.lotId ?? null,
                  },
                ];
            for (const unit of units) {
              const movement = await this.movements.createMovement(
                {
                  type: MovementTypeEnum.OUT,
                  product_id: product.id,
                  qty: unit.quantity,
                  lot_id: unit.lotId ?? undefined,
                  serial_ids: unit.serial ? [unit.serial.id] : undefined,
                  reason_code: 'MATERIAL_ISSUE',
                  source_doc_type: 'MATERIAL_DELIVERY',
                  source_doc_id: String(delivery.id),
                },
                String(actorId),
                em,
              );
              const line = await em.save(
                MaterialDeliveryLine,
                em.create(MaterialDeliveryLine, {
                  deliveryId: delivery.id,
                  itemId,
                  commercialLineId: commercial.id,
                  productId: product.id,
                  lotId: unit.lotId,
                  serialId: unit.serial?.id ?? null,
                  serialCode: unit.serial?.serialCode ?? null,
                  quantity: unit.quantity,
                  returnedQuantity: 0,
                  movementId: movement.id,
                  unitCost: movement.unitCost,
                  saleId: null,
                }),
              );
              issued.push(line);
            }
          }
          await this.invalidate(em, itemId);
          return {
            deliveryId: delivery.id,
            code: `GI-${String(delivery.id).padStart(6, '0')}`,
          };
        },
      );
    });
  }

  async returnMaterial(
    orderId: number,
    itemId: number,
    dto: MaterialReturnDto,
    actorId: number,
  ) {
    if (!dto.faulty || dto.quantity !== 1) {
      throw new BadRequestException(
        'Solo se admite recibir una pieza con serie por falla de fábrica reportada',
      );
    }
    return this.ds.transaction('READ COMMITTED', async (em) => {
      await this.context(em, orderId, itemId, actorId, true);
      return this.once(
        em,
        actorId,
        `return:${orderId}:${itemId}`,
        dto,
        async () => {
          const line = await em.findOneBy(MaterialDeliveryLine, {
            id: dto.deliveryLineId,
            itemId,
          });
          if (!line || line.saleId)
            throw new BadRequestException(
              'Entrega no encontrada o ya facturada',
            );
          if (!dto.reason.trim())
            throw new BadRequestException('Indique el motivo');
          const pending = Number(line.quantity) - Number(line.returnedQuantity);
          if (dto.quantity > pending || (line.serialId && dto.quantity !== 1))
            throw new BadRequestException('Cantidad de devolución inválida');
          if (dto.faulty && !line.serialId)
            throw new BadRequestException(
              'La revisión individual requiere un producto con serie',
            );
          await em.findOne(Product, {
            where: { id: line.productId },
            lock: { mode: 'pessimistic_write' },
          });
          const serial = line.serialId
            ? await em.findOne(Serial, {
                where: { id: line.serialId },
                lock: { mode: 'pessimistic_write' },
              })
            : null;
          if (line.serialId && (!serial || serial.status !== 'ISSUED'))
            throw new BadRequestException('La serie ya no está entregada');
          const movement = await this.movements.createMovement(
            {
              type: MovementTypeEnum.IN,
              product_id: line.productId,
              qty: dto.quantity,
              lot_id: line.lotId ?? undefined,
              serial_codes: serial ? [serial.serialCode] : undefined,
              unit_cost: Number(line.unitCost),
              reason_code: 'MATERIAL_RETURN',
              source_doc_type: 'MATERIAL_RETURN',
              source_doc_id: dto.requestKey,
              notes: dto.reason.trim(),
            },
            String(actorId),
            em,
          );
          const returned = await em.save(
            MaterialReturn,
            em.create(MaterialReturn, {
              deliveryLineId: line.id,
              quantity: dto.quantity,
              faulty: dto.faulty,
              reason: dto.reason.trim(),
              movementId: movement.id,
              actorId,
            }),
          );
          if (serial && dto.faulty) {
            await em.save(
              SerialConditionEvent,
              em.create(SerialConditionEvent, {
                serialId: serial.id,
                previousCondition: serial.condition,
                condition: 'UNDER_REVIEW',
                reason: dto.reason.trim(),
                actorId,
                returnId: returned.id,
              }),
            );
            await em.update(Serial, serial.id, { condition: 'UNDER_REVIEW' });
          }
          line.returnedQuantity = Number(line.returnedQuantity) + dto.quantity;
          await em.save(line);
          await this.invalidate(em, itemId);
          return { returnId: returned.id };
        },
      );
    });
  }

  async reconcile(
    orderId: number,
    itemId: number,
    dto: MaterialReconcileDto,
    actorId: number,
  ) {
    return this.ds.transaction('READ COMMITTED', async (em) => {
      const { item } = await this.context(em, orderId, itemId, actorId, true);
      return this.once(
        em,
        actorId,
        `reconcile:${orderId}:${itemId}`,
        dto,
        async () => {
          if (item.deliveredAt || item.cancelledAt)
            throw new BadRequestException('El equipo no admite conciliación');
          assertReconciliationStage(item.technicalStatus);
          const version = await this.version(em, itemId, dto.versionId);
          const lines = await em.find(MaterialDeliveryLine, {
            where: { itemId },
            order: { id: 'ASC' },
          });
          if (lines.some((line) => line.saleId))
            throw new BadRequestException('El material ya fue facturado');
          const remaining = lines
            .map((line) => ({
              ...line,
              quantity: Number(line.quantity) - Number(line.returnedQuantity),
            }))
            .filter((line) => line.quantity > 0);
          const products = version.lines.filter(
            (line) => line.type === ServiceOrderCommercialLineType.PRODUCT,
          );
          assertMaterialMatch(products, remaining);
          const allocations: MaterialAllocation[] = [];
          for (const commercial of products) {
            let needed = Number(commercial.quantity);
            for (const line of remaining.filter(
              (row) => Number(row.productId) === Number(commercial.productId),
            )) {
              const quantity = Math.min(needed, line.quantity);
              if (quantity <= 0) continue;
              allocations.push({
                commercialLineId: Number(commercial.id),
                deliveryLineId: line.id,
                quantity,
              });
              line.quantity -= quantity;
              needed -= quantity;
            }
          }
          const current = await em.findOneBy(MaterialReconciliation, {
            itemId,
          });
          const result = await em.save(
            MaterialReconciliation,
            em.create(MaterialReconciliation, {
              ...current,
              itemId,
              versionId: version.id,
              allocations,
              actorId,
              confirmedAt: new Date(),
              valid: true,
            }),
          );
          return {
            reconciliationId: result.id,
            versionId: Number(version.id),
            allocations,
          };
        },
      );
    });
  }

  async review(
    orderId: number,
    itemId: number,
    serialId: number,
    dto: MaterialReviewDto,
    actorId: number,
  ) {
    return this.ds.transaction('READ COMMITTED', async (em) => {
      const { user } = await this.context(em, orderId, itemId, actorId, true);
      assertReviewRole(user.roles);
      return this.once(em, actorId, `review:${serialId}`, dto, async () => {
        if (!dto.reason.trim())
          throw new BadRequestException('Indique el motivo de revisión');
        const origin = await em.findOneBy(MaterialDeliveryLine, {
          itemId,
          serialId,
        });
        if (!origin)
          throw new NotFoundException('Serie no vinculada al equipo');
        await em.findOne(Product, {
          where: { id: origin.productId },
          lock: { mode: 'pessimistic_write' },
        });
        const serial = await em.findOne(Serial, {
          where: { id: serialId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !serial ||
          serial.condition !== 'UNDER_REVIEW' ||
          serial.status !== 'IN_STOCK'
        )
          throw new BadRequestException(
            'La serie no está en revisión en almacén',
          );
        const previous = await em.findOne(SerialConditionEvent, {
          where: { serialId },
          order: { id: 'DESC' },
        });
        await em.save(
          SerialConditionEvent,
          em.create(SerialConditionEvent, {
            serialId,
            previousCondition: serial.condition,
            condition: dto.condition,
            reason: dto.reason.trim(),
            actorId,
            returnId: previous?.returnId ?? null,
          }),
        );
        await em.update(Serial, serialId, { condition: dto.condition });
        return { serialId, condition: dto.condition };
      });
    });
  }
}
