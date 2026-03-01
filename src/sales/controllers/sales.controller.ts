// src/sales/controllers/sales.controller.ts
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
    Req,
} from '@nestjs/common';
import { SalesService } from '../services/sales.service';
import { CreateSaleDto } from '../dto/create-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';
import { FilterSalesDto } from '../dto/filter-sales.dto';
import { CancelSaleDto } from '../dto/cancel-sale.dto';
import { SimulateSaleDto } from '../dto/simulate-sale.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
// @Roles('admin', 'seller', 'cashier')
@Controller('sales')
export class SalesController {
    constructor(private readonly salesService: SalesService) { }

    // @Permissions('sales.read')
    @Get()
    findAll(@Query() query: FilterSalesDto) {
        return this.salesService.findAll(query);
    }

    // @Permissions('sales.read')
    @Get('metrics')
    getMetrics(
        @Query('companyId') companyId: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('status') status?: string,
        @Query('documentType') documentType?: string,
        @Query('paymentType') paymentType?: string,
    ) {
        return this.salesService.getMetrics(
            parseInt(companyId),
            dateFrom,
            dateTo,
            status,
            documentType,
            paymentType,
        );
    }

    // @Permissions('sales.read')
    @Get('by-product')
    getSalesByProduct(
        @Query('companyId') companyId: string,
        @Query('productId') productId?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.salesService.getSalesByProduct(
            parseInt(companyId),
            productId ? parseInt(productId) : undefined,
            dateFrom,
            dateTo,
        );
    }

    // @Permissions('sales.read')
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.salesService.findOne(+id);
    }

    // @Permissions('sales.simulate')
    @Post('simulate')
    simulate(@Body() simulateDto: SimulateSaleDto, @Req() req: any) {
        const userPermissions = req.user?.permissions || [];
        return this.salesService.simulate(simulateDto, userPermissions);
    }

    // @Permissions('sales.create')
    @Post()
    create(@Body() createSaleDto: CreateSaleDto, @Req() req: any) {
        const user = req.user?.name || 'System';
        return this.salesService.create(createSaleDto, user);
    }

    // @Permissions('sales.update')
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateSaleDto: UpdateSaleDto,
        @Req() req: any,
    ) {
        const user = req.user?.name || 'System';
        return this.salesService.update(+id, updateSaleDto, user);
    }

    // @Permissions('sales.cancel')
    @Patch(':id/cancel')
    cancel(
        @Param('id') id: string,
        @Body() cancelDto: CancelSaleDto,
        @Req() req: any,
    ) {
        const user = req.user?.name || 'System';
        return this.salesService.cancel(+id, cancelDto, user);
    }
}