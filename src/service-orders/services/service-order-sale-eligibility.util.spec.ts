import { BadRequestException } from '@nestjs/common';
import { ServiceOrderEconomicStatus } from '../enums/service-order-economic-status.enum';
import { ServiceOrderOperativeStatus } from '../enums/service-order-operative-status.enum';
import { ServiceOrderTechnicalStatus } from '../enums/service-order-technical-status.enum';
import { assertServiceOrderEligibleForSale } from './service-order-sale-eligibility.util';

describe('assertServiceOrderEligibleForSale', () => {
  it('acepta una orden pendiente, resuelta y lista para entrega', () => {
    expect(() =>
      assertServiceOrderEligibleForSale({
        code: 'SO-001',
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
        technicalStatus: ServiceOrderTechnicalStatus.RESUELTA,
      }),
    ).not.toThrow();
  });

  it('rechaza una orden sin solución aunque siga pendiente de pago', () => {
    expect(() =>
      assertServiceOrderEligibleForSale({
        code: 'SO-002',
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        operativeStatus: ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
        technicalStatus: ServiceOrderTechnicalStatus.SIN_SOLUCION,
      }),
    ).toThrow(new BadRequestException('La orden SO-002 no está lista para entrega al cliente'));
  });

  it('acepta una orden cancelada que conserva un cargo pendiente', () => {
    expect(() =>
      assertServiceOrderEligibleForSale({
        code: 'SO-003',
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        operativeStatus: ServiceOrderOperativeStatus.CANCELADA,
        technicalStatus: ServiceOrderTechnicalStatus.SIN_SOLUCION,
      }),
    ).not.toThrow();
  });
});
