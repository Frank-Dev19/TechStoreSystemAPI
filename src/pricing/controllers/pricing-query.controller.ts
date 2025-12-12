// src/pricing/controllers/pricing-query.controller.ts
import {
    Controller,
    Get,
    Param,
    Query,
    UseGuards,
    BadRequestException
} from '@nestjs/common';
import { PricingEngineService } from '../services/pricing-engine.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/query')
export class PricingQueryController {
    constructor(private readonly engine: PricingEngineService) { }

    // GET /pricing/query/product/:productId?qty=10&price_list_code=RETAIL&date=2025-11-27
    @Get('product/:productId')
    async getProductPrice(
        @Param('productId') productId: string,
        @Query('qty') qty: string,
        @Query('price_list_code') priceListCode?: string,
        @Query('date') date?: string,
        @Query('user_permissions') userPermsRaw?: string,
    ) {
        const qtyNum = Number(qty);
        const userPerms = userPermsRaw
            ? userPermsRaw.split(',').map((p) => p.trim()).filter(Boolean)
            : [];

        return this.engine.getProductPrice({
            product_id: +productId,
            qty: qtyNum,
            price_list_code: priceListCode,
            date,
            user_permissions: userPerms,
        });
    }


    // GET /pricing/query/product/:productId/best?qty=10&date=2025-11-27
    @Get('product/:productId/best')
    async getBestProductPrice(
        @Param('productId') productId: string,
        @Query('qty') qty: string,
        @Query('date') date?: string,
        @Query('user_permissions') userPermsRaw?: string,
    ) {
        const qtyNum = Number(qty);
        if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0) {
            throw new BadRequestException(
                'qty es obligatorio y debe ser un número mayor a 0',
            );
        }

        const userPerms = userPermsRaw
            ? userPermsRaw.split(',').map((p) => p.trim()).filter(Boolean)
            : [];

        return this.engine.getBestPriceForQty({
            product_id: +productId,
            qty: qtyNum,
            date,
            user_permissions: userPerms,
        });
    }

}
