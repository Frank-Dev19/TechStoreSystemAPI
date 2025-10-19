import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MovementsService } from '../services/movements.service';
import { MovementDto } from '../dto/movement.dto';

@Controller('inventory/movements')
export class MovementsController {
    constructor(private readonly svc: MovementsService) { }

    @Post() create(@Body() dto: MovementDto) { return this.svc.createMovement(dto, 'Usuario Front'); }

    // También puedes usar este endpoint como "kardex" con filtros simples.
    @Get()
    async list(@Query() q: any) {
        const rows = await this.svc.listKardex({
            product_id: q.product_id ? +q.product_id : undefined,
            reason_code: q.reason_code,
            date_from: q.date_from,
            date_to: q.date_to,
        });

        return rows.map(m => {
            const sign =
                m.type === 'IN' ? 1 :
                    m.type === 'OUT' ? -1 :
                        // ADJ: usa totalCost para inferir signo (luego del fix del punto 2)
                        (Number(m.totalCost) < 0 ? -1 : 1);

            return { ...m, qty: Number(m.qty) * sign };
        });
    }

}
