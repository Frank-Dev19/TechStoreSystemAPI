import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { KardexService } from '../services/kardex.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { FilterKardexDto } from '../dto/filter-kardex.dto';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';

@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('inventory-kardex.read')
@Controller('inventory/kardex')
export class KardexController {
    constructor(private readonly svc: KardexService) { }
    @Get() list(@Query() q: FilterKardexDto) { return this.svc.list(q); }
}
