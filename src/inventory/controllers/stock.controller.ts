import { Controller, Get, UseGuards } from '@nestjs/common';
import { StockService } from '../services/stock.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
@Controller('inventory/stock')
export class StockController {
    constructor(private readonly svc: StockService) { }
    @Get() list() { return this.svc.listAll(); }
}
