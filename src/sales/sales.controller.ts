// src/sales/sales.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { FilterSalesDto } from './dto/filter-sales.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@Roles('admin', 'seller')   // puedes ajustar
@Controller('sales')
export class SalesController {
    constructor(private readonly salesService: SalesService) { }

    // =========================
    // LIST
    // =========================
    @Permissions('sales.read')
    @Get()
    findAll(@Query() query: FilterSalesDto) {
        return this.salesService.findAll(query);
    }

    // =========================
    // GET ONE
    // =========================
    @Permissions('sales.read')
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.salesService.findOne(+id);
    }

    // =========================
    // CREATE
    // =========================
    @Permissions('sales.create')
    @Post()
    create(@Body() dto: CreateSaleDto) {
        const user = 'Usuario Front'; // igual que en inventario
        return this.salesService.create(dto, user);
    }

    // =========================
    // UPDATE (solo DRAFT)
    // =========================
    @Permissions('sales.update')
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
        return this.salesService.update(+id, dto);
    }

    // =========================
    // CANCEL
    // =========================
    @Permissions('sales.cancel')
    @Patch(':id/cancel')
    cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
        const user = 'Usuario Front';
        return this.salesService.cancel(+id, body.reason ?? null, user);
    }

    // =========================
    // PDF (placeholder)
    // =========================
    @Permissions('sales.read')
    @Get(':id/pdf')
    getPdf(@Param('id') id: string) {
        return { ok: true, message: 'PDF generation pending', saleId: +id };
    }
}
