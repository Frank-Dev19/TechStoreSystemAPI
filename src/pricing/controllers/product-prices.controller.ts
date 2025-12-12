// src/pricing/controllers/product-prices.controller.ts
import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ProductPricesService } from '../services/product-prices.service';
import { CreateProductPriceDto } from '../dto/create-product-price.dto';
import { UpdateProductPriceDto } from '../dto/update-product-price.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/product-prices')
export class ProductPricesController {
    constructor(private readonly svc: ProductPricesService) { }

    @Get()
    list(
        @Query('product_id') productId?: string,
        @Query('price_list_id') priceListId?: string,
        @Query('active_only') activeOnly?: string,   // 👈 nuevo
    ) {
        // normalizamos active_only => boolean
        const onlyActive =
            activeOnly === 'true' ||
            activeOnly === '1' ||
            activeOnly === 'yes';

        if (productId) {
            return this.svc.listByProduct(+productId, onlyActive);
        }
        if (priceListId) {
            return this.svc.listByPriceList(+priceListId, onlyActive);
        }

        return { data: [], message: 'Use product_id o price_list_id' };
    }

    @Get('coverage')
    coverage(
        @Query('price_list_id') priceListId?: string,
    ) {
        if (!priceListId) {
            return { message: 'price_list_id es requerido' };
        }
        return this.svc.getCoverageForPriceList(+priceListId);
    }


    @Post()
    create(@Body() dto: CreateProductPriceDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateProductPriceDto,
    ) {
        return this.svc.update(+id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.svc.remove(+id);
    }



}
