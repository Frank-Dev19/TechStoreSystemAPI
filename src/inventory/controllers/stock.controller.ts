import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { StockService } from '../services/stock.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { FilterStockDto } from '../dto/filter-stock.dto';

@UseGuards(JwtAccessGuard)
@Controller('inventory/stock')
export class StockController {
    constructor(private readonly svc: StockService) { }

    @Get()
    list(@Query() q: FilterStockDto) {
        return this.svc.listPaged(q);
    }

    @Get('current/:productId')
    getCurrentStock(@Param('productId') productId: number) {
        return this.svc.getCurrentStock(Number(productId));
    }

    @Get('metrics')
    getMetrics(@Query() q: FilterStockDto) {
        return this.svc.getMetrics(q);
    }
}
