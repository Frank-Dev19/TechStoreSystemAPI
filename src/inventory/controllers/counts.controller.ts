import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CountsService } from '../services/counts.service';
import { CreateCountDto } from '../dto/create-count.dto';

@Controller('inventory/counts')
export class CountsController {
    constructor(private readonly svc: CountsService) { }

    @Get()
    list() { return this.svc.list(); }


    @Post()
    create(@Body() dto: CreateCountDto) { return this.svc.create(dto, 'Usuario Front'); }

    @Get(':id')
    get(@Param('id') id: number) { return this.svc.get(+id); }

    @Put(':id/freeze')
    freeze(@Param('id') id: number) { return this.svc.freeze(+id); }


    @Put(':id/start')
    start(@Param('id') id: number) { return this.svc.startCounting(+id); }


    // counts.controller.ts
    @Post(':id/entries/bulk')
    addBulk(
        @Param('id') id: number,
        @Body() b: { entries: { product_id: number; lot_id?: number | null; qty_counted: number; user?: string }[] },
    ) {
        return this.svc.addEntries(+id, b.entries, 'Usuario Front');
    }


    @Post(':id/entries') addEntry(@Param('id') id: number, @Body() b: any) {
        return this.svc.addEntry(+id, {
            product_id: b.product_id, lot_id: b.lot_id ?? null, qty_counted: Number(b.qty_counted), user: 'Usuario Front',
        });
    }
    @Put(':id/review') review(@Param('id') id: number) { return this.svc.review(+id); }
    @Put(':id/post') post(@Param('id') id: number) { return this.svc.post(+id, 'Usuario Front'); }
    @Put(':id/cancel') cancel(@Param('id') id: number) { return this.svc.cancel(+id); }


    //los que faltaban
    @Get(':id/snapshots')
    getSnapshots(@Param('id') id: number) {
        return this.svc.listSnapshots(+id);
    }

    @Get(':id/entries')
    getEntries(@Param('id') id: number) {
        return this.svc.listEntries(+id);
    }

}
