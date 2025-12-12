import { Controller, Get, Post, Body, Query, Param, BadRequestException, UseGuards } from '@nestjs/common';
import { SerialsService } from '../services/serials.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
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

    //     @Post('resolve')
    // async resolveSerials(@Body() body: { serial_codes: string[] }) {
    //   return this.svc.resolveSerials(body.serial_codes);
    // }

    // ✅ NUEVO: resolver seriales (existe / product / lot / lot_code)
    @Post('resolve')
    async resolveSerials(@Body() body: { serial_codes?: string[]; serialCodes?: string[] }) {
        const raw = body?.serial_codes ?? body?.serialCodes ?? [];
        if (!Array.isArray(raw)) throw new BadRequestException('serial_codes debe ser un arreglo');
        const codes = raw.map(c => String(c).trim()).filter(Boolean);
        if (!codes.length) return [];
        return this.svc.resolveSerials(codes);
    }

}
