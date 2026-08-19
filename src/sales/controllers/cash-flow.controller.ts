// src/sales/controllers/cash-flow.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Query,
    UseGuards,
    Req,
    BadRequestException,
} from '@nestjs/common';
import { CashFlowService } from '../services/cash-flow.service';
import { OpenCashRegisterDto } from '../dto/open-cash-register.dto';
import { CloseCashRegisterDto } from '../dto/close-cash-register.dto';
import { CashFlowTransactionDto } from '../dto/cash-flow-transaction.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
// @Roles('admin', 'cashier', 'seller')
@Controller('cash-flow')
export class CashFlowController {
    constructor(private readonly cashFlowService: CashFlowService) { }

    @Permissions('cashflow.read')
    @Get('register')
    getCashRegister(
        @Query('companyId') companyId: string,
        @Query('code') code?: string,
    ) {
        return this.cashFlowService.getCashRegister(
            parseInt(companyId),
            code,
        );
    }

    // Admin: list all registers
    @Permissions('cashflow.read')
    @Get('registers')
    getRegisters(
        @Query('companyId') companyId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.cashFlowService.getAllRegisters(parseInt(companyId), {
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 10,
        });
    }

    // Admin: get currently open register
    @Permissions('cashflow.read')
    @Get('register/open-current')
    getOpenRegister(@Query('companyId') companyId: string) {
        return this.cashFlowService.getOpenRegister(parseInt(companyId));
    }

    @Permissions('cashflow.manage')
    @Post('register/open')
    openCashRegister(
        @Body() openDto: OpenCashRegisterDto,
        @Query('companyId') companyId: string,
        @Query('code') code: string,
        @Req() req: any,
    ) {
        const user = req.user?.name || 'System';
        return this.cashFlowService.openCashRegister(
            parseInt(companyId),
            code,
            openDto,
            user,
        );
    }

    @Permissions('cashflow.manage')
    @Post('register/close')
    closeCashRegister(
        @Body() closeDto: CloseCashRegisterDto,
        @Query('companyId') companyId: string,
        @Query('code') code: string,
        @Req() req: any,
    ) {
        const user = req.user?.name || 'System';
        return this.cashFlowService.closeCashRegister(
            parseInt(companyId),
            code,
            closeDto,
            user,
        );
    }

    @Permissions('cashflow.read')
    @Get('transactions')
    getTransactions(
        @Query('companyId') companyId: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('type') type?: string,
        @Query('subtype') subtype?: string,
        @Query('cashRegisterId') cashRegisterId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.cashFlowService.getTransactions(parseInt(companyId), {
            dateFrom,
            dateTo,
            type,
            subtype,
            cashRegisterId: cashRegisterId ? parseInt(cashRegisterId) : undefined,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 20,
        });
    }

    @Permissions('cashflow.manage')
    @Post('transactions')
    async createTransaction(
        @Body() transactionDto: CashFlowTransactionDto,
        @Query('companyId') companyId: string,
        @Req() req: any,
        @Query('cashRegisterId') cashRegisterId?: string,

    ) {
        const user = req.user?.name || 'System';

        // Obtener caja activa si no se especifica
        let registerId: number | undefined;
        if (cashRegisterId) {
            registerId = parseInt(cashRegisterId);
        } else if (transactionDto.type === 'RETURN' || transactionDto.type === 'INCOME') {
            // Para devoluciones e ingresos, obtener la caja abierta actual
            const openRegister = await this.cashFlowService.getOpenRegister(parseInt(companyId));
            if (!openRegister) {
                throw new BadRequestException('No hay una caja abierta');
            }
            registerId = openRegister.id;
        }

        return this.cashFlowService.registerTransaction({
            cashRegisterId: registerId,
            type: transactionDto.type,
            description: transactionDto.description,
            amount: transactionDto.amount,
            recordedBy: user,
            reference: transactionDto.reference,
            observations: transactionDto.observations,
        });
    }

    @Permissions('cashflow.reports')
    @Get('reports/daily')
    getDailyReport(
        @Query('companyId') companyId: string,
        @Query('date') date: string,
    ) {
        return this.cashFlowService.getDailyReport(
            parseInt(companyId),
            date,
        );
    }

    @Permissions('cashflow.read')
    @Get('metrics')
    getCashFlowMetrics(
        @Query('companyId') companyId: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('cashRegisterId') cashRegisterId?: string,
    ) {
        return this.cashFlowService.getCashFlowMetrics(parseInt(companyId), {
            dateFrom,
            dateTo,
            cashRegisterId: cashRegisterId ? parseInt(cashRegisterId) : undefined,
        });
    }
}


