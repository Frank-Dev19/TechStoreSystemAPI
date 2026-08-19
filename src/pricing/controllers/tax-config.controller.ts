import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { TaxConfigService } from '../services/tax-config.service';
import { CreateTaxConfigDto, UpdateTaxConfigDto } from '../dto/tax-config.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';

@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('pricing.read')
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
    @Permissions('pricing.manage')
    create(@Body() dto: CreateTaxConfigDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    @Permissions('pricing.manage')
    update(@Param('id') id: number, @Body() dto: UpdateTaxConfigDto) {
        return this.svc.update(+id, dto);
    }

    @Post('seed')
    @Permissions('pricing.manage')
    seed() {
        return this.svc.seed();
    }
}
