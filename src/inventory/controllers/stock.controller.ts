import { Controller, Get } from '@nestjs/common';
import { StockService } from '../services/stock.service';

@Controller('inventory/stock')
export class StockController {
    constructor(private readonly svc: StockService) { }
    @Get() list() { return this.svc.listAll(); }
}
