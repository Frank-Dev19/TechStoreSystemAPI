import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PricingEngineService } from '../services/pricing-engine.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';

@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('pricing.read')
@Controller('pricing/query')
export class PricingQueryController {
    constructor(private readonly engine: PricingEngineService) {}

    // GET /pricing/query/product/:productId
    @Get('product/:productId')
    calculatePrice(@Param('productId') productId: number) {
        return this.engine.calculatePrice(+productId);
    }

    // GET /pricing/query/product/:productId/validate-discount?pct=3.5
    @Get('product/:productId/validate-discount')
    validateDiscount(
        @Param('productId') productId: number,
        @Query('pct') pct: number,
    ) {
        return this.engine.validateDiscount(+productId, Number(pct));
    }

    // GET /pricing/query/bulk?ids=1,2,3
    @Get('bulk')
    calculateBulk(@Query('ids') ids: string) {
        const productIds = (ids || '').split(',').map(Number).filter(n => !isNaN(n));
        return this.engine.calculatePricesBulk(productIds);
    }
}
