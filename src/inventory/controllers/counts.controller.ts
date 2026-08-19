import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CountsService } from '../services/counts.service';
import { CreateCountDto } from '../dto/create-count.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('inventory-manage.read')
@Controller('inventory/counts')
export class CountsController {
    constructor(private readonly svc: CountsService) { }

    @Get()
    list() { return this.svc.list(); }


    @Post()
    @Permissions('inventory-manage.manage')
    create(@Body() dto: CreateCountDto) {
        const user = dto.createdBy || 'Usuario Front';
        return this.svc.create(dto, user);
    }

    @Get(':id')
    get(@Param('id') id: number) {
        return this.svc.get(+id);
    }

    @Put(':id/freeze')
    @Permissions('inventory-manage.manage')
    freeze(@Param('id') id: number) {
        return this.svc.freeze(+id);
    }


    @Put(':id/start')
    @Permissions('inventory-manage.manage')
    start(@Param('id') id: number) { return this.svc.startCounting(+id); }


    // counts.controller.ts
    @Post(':id/entries/bulk')
    @Permissions('inventory-manage.manage')
    addBulk(
        @Param('id') id: number,
        @Body() b: { user?: string; entries: { product_id: number; lot_id?: number | null; qty_counted: number; user?: string }[] },
    ) {
        const entries = b?.entries ?? [];
        const user = b?.user || entries.find((entry) => !!entry.user)?.user || 'Usuario Front';
        return this.svc.addEntries(+id, entries, user);
    }


    // ...
    @Post(':id/entries')
    @Permissions('inventory-manage.manage')
    addEntry(@Param('id') id: number, @Body() b: any) {
        // Acepta snake o camel desde el front
        const serial_codes: string[] = b.serial_codes ?? b.serialCodes ?? [];
        return this.svc.addEntry(+id, {
            product_id: b.product_id ?? b.productId,
            lot_id: (b.lot_id ?? b.lotId) ?? null,
            qty_counted: Number(b.qty_counted ?? b.qtyCounted),
            user: b.user,
            serial_codes, // <-- NUEVO
        });
    }

    @Put(':id/review')
    @Permissions('inventory-manage.manage')
    review(@Param('id') id: number, @Body() b: { user?: string }) {
        return this.svc.review(+id, b?.user || 'Usuario Front');
    }

    @Put(':id/post')
    @Permissions('inventory-manage.manage')
    post(@Param('id') id: number, @Body() b: { user?: string }) {
        return this.svc.post(+id, b?.user || 'Usuario Front');
    }

    @Put(':id/cancel')
    @Permissions('inventory-manage.manage')
    cancel(@Param('id') id: number) {
        return this.svc.cancel(+id);
    }


    //los que faltaban
    @Get(':id/snapshots')
    getSnapshots(@Param('id') id: number) {
        return this.svc.listSnapshots(+id);
    }

    @Get(':id/entries')
    getEntries(@Param('id') id: number) {
        return this.svc.listEntries(+id);
    }

    @Get(':id/entries/:entryId/serials')
    getEntrySerials(@Param('entryId') entryId: number) {
        return this.svc.listEntrySerials(+entryId);
    }


    //devolver por cada producto y lote las seriales  faltantes, sobrantes, coincidentes
    @Get(':id/serial-diffs')
    getSerialDiffs(@Param('id') id: number) {
        return this.svc.serialDiffs(+id);
    }


    // ====== NUEVO: leer diferencias persistidas ======
    @Get(':id/differences')
    getDifferences(@Param('id') id: number) {
        return this.svc.listDifferences(+id);
    }

    @Get(':id/differences/summary')
    getDifferencesSummary(@Param('id') id: number) {
        return this.svc.getDifferencesSummary(+id) ?? { surplusValue: 0, shortageValue: 0, netValue: 0 };
    }


}
