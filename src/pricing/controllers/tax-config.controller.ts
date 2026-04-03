import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { TaxConfigService } from '../services/tax-config.service';
import { CreateTaxConfigDto, UpdateTaxConfigDto } from '../dto/tax-config.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/taxes')
export class TaxConfigController {
    constructor(private readonly svc: TaxConfigService) {}

    @Get()
    findAll() {
        return this.svc.findAll();
    }

    @Get('igv')
    getIGV() {
        return this.svc.getIGVRate().then(rate => ({ code: 'IGV', rate }));
    }

    @Get('renta')
    getRenta() {
        return this.svc.getRentaRate().then(rate => ({ code: 'RENTA', rate }));
    }

    @Post()
    create(@Body() dto: CreateTaxConfigDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    update(@Param('id') id: number, @Body() dto: UpdateTaxConfigDto) {
        return this.svc.update(+id, dto);
    }

    @Post('seed')
    seed() {
        return this.svc.seed();
    }
}
