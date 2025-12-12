import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { LotsService } from '../services/lots.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
@Controller('lots')
export class LotsController {
    constructor(private readonly svc: LotsService) { }

    @Post()
    create(@Body() b: { product_id: number; lot_code: string; expiration_date?: string | null }) {
        return this.svc.create(b);
    }

    @Get()
    list(@Query('product_id') product_id?: string) {
        return this.svc.list(product_id ? +product_id : undefined);
    }
}
