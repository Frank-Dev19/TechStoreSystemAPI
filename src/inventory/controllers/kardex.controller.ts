import { Controller, Get, Query } from '@nestjs/common';
import { KardexService } from '../services/kardex.service';

@Controller('inventory/kardex')
export class KardexController {
    constructor(private readonly svc: KardexService) { }
    @Get() list(@Query() q: any) { return this.svc.list(q); }
}
