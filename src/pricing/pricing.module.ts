import { Module } from '@nestjs/common';
// import { PricingService } from './pricing.service';
// import { PricingController } from './pricing.controller';

import { TypeOrmModule } from '@nestjs/typeorm';

import { PriceList } from './entities/price-list.entity';
import { ProductPrice } from './entities/product-price.entity';
import { DiscountRule } from './entities/discount-rule.entity';
import { Combo } from './entities/combo.entity';
import { ComboItem } from './entities/combo-item.entity';

import { Product } from 'src/inventory/entities/product.entity';
import { Category } from 'src/inventory/entities/category.entity';

import { PriceListsService } from './services/price-lists.service';
import { ProductPricesService } from './services/product-prices.service';
import { DiscountRulesService } from './services/discount-rules.service';
import { CombosService } from './services/combos.service';
import { PricingEngineService } from './services/pricing-engine.service';

import { PriceListsController } from './controllers/price-lists.controller';
import { ProductPricesController } from './controllers/product-prices.controller';
import { DiscountRulesController } from './controllers/discount-rules.controller';
import { CombosController } from './controllers/combos.controller';
import { PricingQueryController } from './controllers/pricing-query.controller';
import { DiscountExpiryService } from './services/discount-expiry.service';
import { ComboValidityService } from './services/combo-validity.service';
// import { SimulationEngineService } from './services/simulation-engine.service';
//import { SimulationController } from './controllers/simulation.controller';
import { PricingSimulationController } from './controllers/pricing-simulation.controller';
import { PricingSimulationService } from './services/pricing-simulation.service';

import { ScheduleModule } from '@nestjs/schedule';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PriceList,
      ProductPrice,
      DiscountRule,
      Combo,
      ComboItem,
      Product,
      Category,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    PriceListsController,
    ProductPricesController,
    DiscountRulesController,
    CombosController,
    PricingQueryController,
    //SimulationController,
    PricingSimulationController,
  ],
  providers: [
    PriceListsService,
    ProductPricesService,
    DiscountRulesService,
    CombosService,
    PricingEngineService,
    DiscountExpiryService,
    ComboValidityService,
    // SimulationEngineService,
    PricingSimulationService
  ],
  exports: [PricingEngineService, PricingSimulationService, CombosService],
})
export class PricingModule { }
