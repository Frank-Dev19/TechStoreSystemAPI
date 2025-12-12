import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { KardexService } from '../services/kardex.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
@Controller('inventory/kardex')
export class KardexController {
    constructor(private readonly svc: KardexService) { }
    @Get() list(@Query() q: any) { return this.svc.list(q); }
}
