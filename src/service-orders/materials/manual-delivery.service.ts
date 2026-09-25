import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { TECHNICIAN_ROLE_NAMES } from '../../common/constants/role-names';
import { MovementTypeEnum } from '../../inventory/dto/movement.dto';
import { Lot } from '../../inventory/entities/lot.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Serial } from '../../inventory/entities/serial.entity';
import { Stock } from '../../inventory/entities/stock.entity';
import { MovementsService } from '../../inventory/services/movements.service';
import { User } from '../../users/entities/user.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { CreateManualDeliveryDto } from './manual-delivery.dto';
import {
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialOperation,
} from './material.entity';
import { manualDeliveryQuantity } from './delivery-list.service';

@Injectable()
export class ManualDeliveryService {
  constructor(
    private readonly ds: DataSource,
    private readonly movements: MovementsService,
  ) {}

  async options(productId: number) {
    const product = await this.ds.manager.findOne(Product, {
      where: { id: productId },
      relations: ['baseUnit'],
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const [stocks, serials] = await Promise.all([
      this.ds.manager.find(Stock, {
        where: { productId },
        relations: ['lot'],
        order: { lotId: 'ASC' },
      }),
      product.isSerialized
        ? this.ds.manager.find(Serial, {
            where: { productId, status: 'IN_STOCK', condition: 'USABLE' },
            order: { serialCode: 'ASC' },
          })
        : Promise.resolve([]),
    ]);
    return {
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        isSerialized: product.isSerialized,
        managesExpiration: product.managesExpiration,
        unit:
          product.baseUnit?.abbreviation || product.baseUnit?.name || 'unidad',
      },
      availableQuantity: stocks.reduce(
        (sum, row) => sum + Number(row.qtyOnHand),
        0,
      ),
      lots: stocks
        .filter((row) => Number(row.qtyOnHand) > 0 && row.lotId)
        .map((row) => ({
          id: Number(row.lotId),
          lotCode: row.lot?.lotCode || `Lote #${row.lotId}`,
          availableQuantity: Number(row.qtyOnHand),
        })),
      serials: serials.map((serial) => ({
        id: serial.id,
        serialCode: serial.serialCode,
        lotId: serial.lotId ?? null,
      })),
    };
  }

  async create(dto: CreateManualDeliveryDto, actorId: number) {
    return this.ds.transaction('READ COMMITTED', async (em) => {
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ actorId, dto }))
        .digest('hex');
      const previous = await em.findOneBy(MaterialOperation, {
        requestKey: dto.requestKey,
      });
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ConflictException(
            'La clave de operación ya fue usada con otros datos',
          );
        return previous.result;
      }
      const technician = await em.findOne(User, {
        where: { id: dto.technicianId, isActive: true },
        relations: ['roles'],
      });
      if (
        !technician ||
        !technician.roles.some((role) =>
          (TECHNICIAN_ROLE_NAMES as readonly string[]).includes(
            role.name?.trim().toLowerCase(),
          ),
        )
      )
        throw new BadRequestException('Selecciona un técnico activo');

      const serviceOrder = dto.serviceOrderId
        ? await em.findOneBy(ServiceOrder, { id: dto.serviceOrderId })
        : null;
      if (dto.serviceOrderId && !serviceOrder)
        throw new BadRequestException('La orden de servicio seleccionada no existe');
      if (
        serviceOrder?.assignedToTechnicianId &&
        Number(serviceOrder.assignedToTechnicianId) !== Number(technician.id)
      )
        throw new BadRequestException(
          'La orden está asignada a un técnico distinto del receptor',
        );

      const delivery = await em.save(
        MaterialDelivery,
        em.create(MaterialDelivery, {
          type: 'MANUAL',
          serviceOrderId: serviceOrder?.id ?? null,
          itemId: null,
          versionId: null,
          technicianId: technician.id,
          actorId,
          notes: dto.notes?.trim() || null,
        }),
      );
      for (const line of dto.lines) {
        const product = await em.findOne(Product, {
          where: { id: line.productId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!product) throw new NotFoundException('Producto no encontrado');
        const quantity = manualDeliveryQuantity(
          product.isSerialized,
          line.quantity,
          line.serialIds ?? [],
        );
        if (product.managesExpiration && !line.lotId)
          throw new BadRequestException(
            `${product.name} requiere seleccionar un lote`,
          );
        const movement = await this.movements.createMovement(
          {
            type: MovementTypeEnum.OUT,
            product_id: product.id,
            qty: quantity,
            lot_id: line.lotId,
            serial_ids: line.serialIds,
            reason_code: 'TECHNICIAN_SUPPLY_ISSUE',
            source_doc_type: 'INTERNAL_DELIVERY',
            source_doc_id: String(delivery.id),
            notes: dto.notes?.trim() || `Entrega a ${technician.name}`,
          },
          String(actorId),
          em,
        );
        const serials = line.serialIds?.length
          ? await em.findBy(Serial, { id: In(line.serialIds) })
          : [];
        if (product.isSerialized) {
          for (const serial of serials) {
            await em.save(
              MaterialDeliveryLine,
              em.create(MaterialDeliveryLine, {
                deliveryId: delivery.id,
                itemId: null,
                commercialLineId: null,
                productId: product.id,
                productNameSnapshot: product.name,
                lotId: serial.lotId ?? line.lotId ?? null,
                serialId: serial.id,
                serialCode: serial.serialCode,
                quantity: 1,
                returnedQuantity: 0,
                unitCost: movement.unitCost,
                movementId: movement.id,
                saleId: null,
              }),
            );
          }
        } else {
          await em.save(
            MaterialDeliveryLine,
            em.create(MaterialDeliveryLine, {
              deliveryId: delivery.id,
              itemId: null,
              commercialLineId: null,
              productId: product.id,
              productNameSnapshot: product.name,
              lotId: line.lotId ?? null,
              serialId: null,
              serialCode: null,
              quantity,
              returnedQuantity: 0,
              unitCost: movement.unitCost,
              movementId: movement.id,
              saleId: null,
            }),
          );
        }
      }
      const result = { deliveryId: delivery.id, code: `EI-${delivery.id}` };
      await em.save(
        MaterialOperation,
        em.create(MaterialOperation, {
          requestKey: dto.requestKey,
          fingerprint,
          action: 'manual-delivery',
          actorId,
          result,
        }),
      );
      return result;
    });
  }
}
