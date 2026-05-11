import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderEconomicStatus } from '../enums/service-order-economic-status.enum';
import { ServiceOrderOperativeStatus } from '../enums/service-order-operative-status.enum';
import { ServiceOrderTechnicalStatus } from '../enums/service-order-technical-status.enum';

type ServiceOrderSaleEligibilityCandidate = Pick<
  ServiceOrder,
  'code' | 'economicStatus' | 'operativeStatus' | 'technicalStatus'
>;

export function applyServiceOrderSaleEligibilityFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): SelectQueryBuilder<T> {
  return qb
    .andWhere(`${alias}.economicStatus = :eligibleEconomicStatus`, {
      eligibleEconomicStatus: ServiceOrderEconomicStatus.PENDIENTE,
    })
    .andWhere(`${alias}.operativeStatus = :eligibleOperativeStatus`, {
      eligibleOperativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
    })
    .andWhere(`${alias}.technicalStatus = :eligibleTechnicalStatus`, {
      eligibleTechnicalStatus: ServiceOrderTechnicalStatus.RESUELTA,
    });
}

export function assertServiceOrderEligibleForSale(
  serviceOrder: ServiceOrderSaleEligibilityCandidate,
): void {
  const orderLabel = serviceOrder.code ? `La orden ${serviceOrder.code}` : 'La orden';

  if (serviceOrder.economicStatus !== ServiceOrderEconomicStatus.PENDIENTE) {
    throw new BadRequestException(`${orderLabel} no está pendiente de pago`);
  }

  if (serviceOrder.operativeStatus !== ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA) {
    throw new BadRequestException(`${orderLabel} no está lista para entrega al cliente`);
  }

  if (serviceOrder.technicalStatus !== ServiceOrderTechnicalStatus.RESUELTA) {
    throw new BadRequestException(`${orderLabel} todavía no tiene el servicio resuelto`);
  }
}
