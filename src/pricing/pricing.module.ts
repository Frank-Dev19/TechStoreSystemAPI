import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PricingConfig } from './entities/pricing-config.entity';
import { TaxConfig } from './entities/tax-config.entity';
import { Stock } from 'src/inventory/entities/stock.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Category } from 'src/inventory/entities/category.entity';

import { PricingConfigService } from './services/pricing-config.service';
import { TaxConfigService } from './services/tax-config.service';
import { PricingEngineService } from './services/pricing-engine.service';

import { PricingConfigController } from './controllers/pricing-config.controller';
import { TaxConfigController } from './controllers/tax-config.controller';
import { PricingQueryController } from './controllers/pricing-query.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            PricingConfig,
            TaxConfig,
            Stock,
            Product,
            Category,
        ]),
    ],
    controllers: [
        PricingConfigController,
        TaxConfigController,
        PricingQueryController,
    ],
    providers: [
        PricingConfigService,
        TaxConfigService,
        PricingEngineService,
    ],
    exports: [PricingEngineService, PricingConfigService, TaxConfigService],
})
export class PricingModule implements OnModuleInit {
    constructor(private readonly taxService: TaxConfigService) {}

    async onModuleInit() {
        // Crear registros de IGV y Renta si no existen
        await this.taxService.seed();
    }
}
