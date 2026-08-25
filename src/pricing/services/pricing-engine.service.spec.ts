import { BadRequestException } from '@nestjs/common';
import { Movement } from '../../inventory/entities/movement.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Stock } from '../../inventory/entities/stock.entity';
import { PricingEngineService } from './pricing-engine.service';

describe('PricingEngineService', () => {
  const stockRepo = { find: jest.fn() };
  const productRepo = { findOne: jest.fn() };
  const movementRepo = { findOne: jest.fn() };
  const configService = { resolveForProduct: jest.fn() };
  const taxService = { getIGVRate: jest.fn() };
  let service: PricingEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PricingEngineService(
      stockRepo as never,
      productRepo as never,
      movementRepo as never,
      configService as never,
      taxService as never,
    );
    productRepo.findOne.mockResolvedValue({ id: 7, name: 'Memoria', sku: 'RAM-16' } as Product);
    configService.resolveForProduct.mockResolvedValue({
      config: { profitMarginPct: 15, maxDiscountPct: 7 },
      scope: 'global',
    });
    taxService.getIGVRate.mockResolvedValue(18);
  });

  it('usa el ultimo costo historico positivo cuando el stock actual se agoto', async () => {
    stockRepo.find.mockResolvedValue([{ productId: 7, qtyOnHand: 0, totalCost: 0 } as Stock]);
    movementRepo.findOne.mockResolvedValue({ productId: 7, unitCost: 50 } as Movement);

    const result = await service.calculatePrice(7);

    expect(result.cpp).toBe(50);
    expect(result.recommendedPrice).toBe(67.85);
    expect(result.minAllowedPrice).toBe(61.07);
    expect(result.costSource).toBe('MOVEMENT_HISTORY');
  });

  it('rechaza el calculo si no existe ningun costo positivo', async () => {
    stockRepo.find.mockResolvedValue([]);
    movementRepo.findOne.mockResolvedValue(null);

    await expect(service.calculatePrice(7)).rejects.toBeInstanceOf(BadRequestException);
  });
});
