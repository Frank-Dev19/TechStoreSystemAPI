import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Query,
    StreamableFile,
    UseGuards,
} from '@nestjs/common';
import {
    KardexQueryFilters,
    MovementsService,
} from '../services/movements.service';
import { MovementDto } from '../dto/movement.dto';
import { Req } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';

type KardexQueryParams = {
    product_id?: string;
    reason_code?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
    limit?: string;
};
@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('inventory-manage.read')
@Controller('inventory/movements')
export class MovementsController {
    constructor(private readonly svc: MovementsService) { }

    @Post()
    @Permissions('inventory-manage.manage')
    create(@Body() dto: MovementDto, @Req() req: any) {
        if (dto.source_doc_type?.startsWith('MATERIAL_') || dto.reason_code?.startsWith('MATERIAL_')) throw new BadRequestException('Use el flujo de guías internas para movimientos de reparación');
        const user =
            req.user?.name || dto.user_created || req.headers['x-user-name'] || 'Usuario Front';
        return this.svc.createMovement(dto, user);
    }

    @Get('export')
    @Permissions('inventory-kardex.read')
    async exportCsv(@Query() q: KardexQueryParams) {
        const filters = this.parseKardexFilters(q, false);
        const csv = await this.svc.exportKardexCsv(filters);
        const suffix = filters.date_from && filters.date_to
            ? `${filters.date_from}-a-${filters.date_to}`
            : new Date().toISOString().slice(0, 10);
        return new StreamableFile(Buffer.from(csv, 'utf8'), {
            type: 'text/csv; charset=utf-8',
            disposition: `attachment; filename="kardex-${suffix}.csv"`,
        });
    }

    // También puedes usar este endpoint como "kardex" con filtros simples.
    @Get()
    @Permissions('inventory-kardex.read')
    async list(@Query() q: KardexQueryParams) {
        const result = await this.svc.listKardex(this.parseKardexFilters(q, true));

        result.data = result.data.map(m => {
            const sign =
                m.type === 'IN' ? 1 :
                    m.type === 'OUT' ? -1 :
                        // ADJ: usa totalCost para inferir signo (luego del fix del punto 2)
                        (Number(m.totalCost) < 0 ? -1 : 1);

            return { ...m, qty: Number(m.qty) * sign } as any;
        });

        return result;
    }

    private parseKardexFilters(q: KardexQueryParams, includePagination: boolean): KardexQueryFilters {
        return {
            product_id: q.product_id ? +q.product_id : undefined,
            reason_code: q.reason_code,
            date_from: q.date_from,
            date_to: q.date_to,
            ...(includePagination && q.page ? { page: +q.page } : {}),
            ...(includePagination && q.limit ? { limit: +q.limit } : {}),
        };
    }
}
