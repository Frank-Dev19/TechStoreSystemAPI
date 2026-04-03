import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { PricingConfigService } from '../services/pricing-config.service';
import { CreatePricingConfigDto, UpdatePricingConfigDto } from '../dto/pricing-config.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/config')
export class PricingConfigController {
    constructor(private readonly svc: PricingConfigService) {}

    @Get()
    findAll() {
        return this.svc.findAll();
    }

    @Get('resolve/:productId')
    resolve(@Param('productId') productId: number) {
        return this.svc.resolveForProduct(+productId);
    }

    @Post()
    create(@Body() dto: CreatePricingConfigDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    update(@Param('id') id: number, @Body() dto: UpdatePricingConfigDto) {
        return this.svc.update(+id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.svc.remove(+id);
    }
}
