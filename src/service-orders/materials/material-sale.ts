import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Serial } from '../../inventory/entities/serial.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';
import {
  MaterialDeliveryLine,
  MaterialReconciliation,
} from './material.entity';
import { assertMaterialMatch } from './material-policy';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';

export type MaterialSaleSource = {
  deliveryLineId: number;
  deliveryId: number;
  itemId: number;
  commercialLineId: number;
  productId: number;
  quantity: number;
  lotId: number | null;
  serialId: number | null;
  serialCode: string | null;
  unitCost: number;
};

/** Must run inside the sale transaction, before issuing its number or touching cash. */
export async function prepareMaterialSale(
  em: EntityManager,
  agreement: ServiceOrderAgreement,
): Promise<Map<number, MaterialSaleSource[]>> {
  await em.findOne(ServiceOrder, {
    where: { id: Number(agreement.serviceOrderId) },
    lock: { mode: 'pessimistic_write' },
  });
  const current = await em.findOneBy(ServiceOrderAgreement, {
    id: Number(agreement.id),
  });
  if (!current || current.status !== ServiceOrderAgreementStatus.CONFIRMED)
    throw new BadRequestException('La cotización cambió antes de facturar');
  const result = new Map<number, MaterialSaleSource[]>();
  if (!agreement.items?.length) {
    if (agreement.productItems?.length)
      throw new BadRequestException(
        'Los productos requieren entrega y conciliación por equipo',
      );
    return result;
  }
  for (const selected of agreement.items) {
    const itemId = Number(selected.serviceOrderItemId);
    const version = await em.findOne(ServiceOrderItemCommercialVersion, {
      where: {
        serviceOrderItemId: itemId,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
      },
      order: { versionNumber: 'DESC' },
      relations: ['lines'],
    });
    if (!version || Number(version.id) !== Number(selected.commercialVersionId))
      throw new BadRequestException('La versión aprobada del equipo cambió');
    const expected = version.lines.filter(
      (line) => line.type === ServiceOrderCommercialLineType.PRODUCT,
    );
    const deliveries = await em.findBy(MaterialDeliveryLine, { itemId });
    const outstanding = deliveries.filter(
      (line) => Number(line.quantity) > Number(line.returnedQuantity),
    );
    if (!expected.length && !outstanding.length) continue;
    const reconciliation = await em.findOneBy(MaterialReconciliation, {
      itemId,
    });
    if (
      !reconciliation?.valid ||
      Number(reconciliation.versionId) !== Number(version.id)
    )
      throw new BadRequestException(
        'Confirme los materiales utilizados/devueltos del equipo antes de vender',
      );
    assertMaterialMatch(
      expected,
      outstanding.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity) - Number(line.returnedQuantity),
      })),
    );
    for (const commercial of expected) {
      const allocations = reconciliation.allocations.filter(
        (row) => Number(row.commercialLineId) === Number(commercial.id),
      );
      if (
        Math.abs(
          allocations.reduce((sum, row) => sum + row.quantity, 0) -
            Number(commercial.quantity),
        ) > 0.00001
      )
        throw new BadRequestException('Conciliación incompleta');
      const sources: MaterialSaleSource[] = [];
      for (const allocation of allocations) {
        const line = outstanding.find(
          (row) => Number(row.id) === Number(allocation.deliveryLineId),
        );
        if (
          !line ||
          line.saleId ||
          Number(line.productId) !== Number(commercial.productId)
        )
          throw new BadRequestException(
            'Material ya facturado o procedencia inválida',
          );
        if (line.serialId) {
          const serial = await em.findOneBy(Serial, { id: line.serialId });
          if (
            !serial ||
            serial.status !== 'ISSUED' ||
            serial.condition !== 'USABLE'
          )
            throw new BadRequestException('La serie instalada ya no es válida');
        }
        sources.push({
          deliveryLineId: line.id,
          deliveryId: line.deliveryId,
          itemId,
          commercialLineId: Number(commercial.id),
          productId: line.productId,
          quantity: allocation.quantity,
          lotId: line.lotId,
          serialId: line.serialId,
          serialCode: line.serialCode,
          unitCost: Number(line.unitCost),
        });
      }
      result.set(Number(commercial.id), sources);
    }
  }
  return result;
}

export async function claimMaterialSale(
  em: EntityManager,
  sources: Map<number, MaterialSaleSource[]>,
  saleId: number,
) {
  for (const id of new Set(
    [...sources.values()].flat().map((source) => source.deliveryLineId),
  )) {
    await em.update(MaterialDeliveryLine, id, { saleId });
  }
}
