import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LotsService } from '../services/lots.service';

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
