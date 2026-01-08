// src/pricing/controllers/discount-rules.controller.ts
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
import { DiscountRulesService } from '../services/discount-rules.service';
import { CreateDiscountRuleDto } from '../dto/create-discount-rule.dto';
import { UpdateDiscountRuleDto } from '../dto/update-discount-rule.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/discount-rules')
export class DiscountRulesController {
    constructor(private readonly svc: DiscountRulesService) { }

    // @Get()
    // list(
    //     @Query('product_id') productId?: string,
    //     @Query('category_id') categoryId?: string,
    //     @Query('price_list_id') priceListId?: string,
    //     @Query('active_only') activeOnly?: string,
    // ) {
    //     const onlyActive =
    //         activeOnly === 'true' ||
    //         activeOnly === '1' ||
    //         activeOnly === 'yes';

    //     return this.svc.list({
    //         product_id: productId ? +productId : undefined,
    //         category_id: categoryId ? +categoryId : undefined,
    //         price_list_id: priceListId ? +priceListId : undefined,
    //         active_only: onlyActive,
    //     });
    // }

    @Get()
    list(
        @Query('product_id') productId?: string,
        @Query('category_id') categoryId?: string,
        @Query('price_list_id') priceListId?: string,
        @Query('active_only') activeOnly?: string,
        @Query('auto_check') autoCheck?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const onlyActive =
            activeOnly === 'true' ||
            activeOnly === '1' ||
            activeOnly === 'yes';

        const shouldAutoCheck = autoCheck === 'true' || autoCheck === '1';

        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;

        if (shouldAutoCheck) {
            // Usar el método que auto-desactiva
            return this.svc.listWithAutoDeactivation({
                product_id: productId ? +productId : undefined,
                category_id: categoryId ? +categoryId : undefined,
                price_list_id: priceListId ? +priceListId : undefined,
                active_only: onlyActive,
                page: pageNum,
                limit: limitNum,
            });
        } else {
            // Usar el método normal
            return this.svc.list({
                product_id: productId ? +productId : undefined,
                category_id: categoryId ? +categoryId : undefined,
                price_list_id: priceListId ? +priceListId : undefined,
                active_only: onlyActive,
                page: pageNum,
                limit: limitNum,
            });
        }
    }


    @Get('all')
    listAll(
        @Query('product_id') productId?: string,
        @Query('category_id') categoryId?: string,
        @Query('price_list_id') priceListId?: string,
        @Query('active_only') activeOnly?: string,
        @Query('auto_check') autoCheck?: string,
    ) {
        const onlyActive =
            activeOnly === 'true' ||
            activeOnly === '1' ||
            activeOnly === 'yes';

        const shouldAutoCheck = autoCheck === 'true' || autoCheck === '1';

        if (shouldAutoCheck) {
            // PRIMERO ejecutar validación automática
            return this.svc.findAllWithAutoDeactivation({
                product_id: productId ? +productId : undefined,
                category_id: categoryId ? +categoryId : undefined,
                price_list_id: priceListId ? +priceListId : undefined,
                active_only: onlyActive,
            });
        } else {
            // Usar el método normal
            return this.svc.findAll({
                product_id: productId ? +productId : undefined,
                category_id: categoryId ? +categoryId : undefined,
                price_list_id: priceListId ? +priceListId : undefined,
                active_only: onlyActive,
            });
        }
    }



    @Post()
    create(@Body() dto: CreateDiscountRuleDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateDiscountRuleDto,
    ) {
        return this.svc.update(+id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.svc.remove(+id);
    }
}
