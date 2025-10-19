import { Controller, Get, Query, Param } from '@nestjs/common';
import { SerialsService } from '../services/serials.service';

@Controller('serials')
export class SerialsController {
    constructor(private readonly svc: SerialsService) { }

    @Get()
    list(@Query('product_id') product_id: string, @Query('lot_id') lot_id?: string, @Query('status') status?: string) {
        if (!product_id) throw new Error('product_id es obligatorio');
        return this.svc.list({
            product_id: +product_id,
            lot_id: lot_id !== undefined ? (lot_id === 'null' ? null : +lot_id) : undefined,
            status: status as any,
        });
    }

    @Get('by-movement/:movement_id')
    byMovement(@Param('movement_id') movement_id: string) {
        return this.svc.byMovement(+movement_id);
    }
}
