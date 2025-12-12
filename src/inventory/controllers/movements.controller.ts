import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MovementsService } from '../services/movements.service';
import { MovementDto } from '../dto/movement.dto';
import { Req } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
@Controller('inventory/movements')
export class MovementsController {
    constructor(private readonly svc: MovementsService) { }

    @Post()
    create(@Body() dto: MovementDto, @Req() req: any) {
        const user =
            req.user?.name || dto.user_created || req.headers['x-user-name'] || 'Usuario Front';
        return this.svc.createMovement(dto, user);
    }

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
