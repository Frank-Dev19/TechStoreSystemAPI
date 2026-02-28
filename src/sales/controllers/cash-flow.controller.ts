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
} from '@nestjs/common';
import { CashFlowService } from '../services/cash-flow.service';
import { OpenCashRegisterDto } from '../dto/open-cash-register.dto';
import { CloseCashRegisterDto } from '../dto/close-cash-register.dto';
import { CashFlowTransactionDto } from '../dto/cash-flow-transaction.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
// @Roles('admin', 'cashier', 'seller')
@Controller('cash-flow')
export class CashFlowController {
    constructor(private readonly cashFlowService: CashFlowService) { }

    // @Permissions('cashflow.read')
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
    @Get('registers')
    getRegisters(@Query('companyId') companyId: string) {
        return this.cashFlowService.getAllRegisters(parseInt(companyId));
    }

    // Admin: get currently open register
    @Get('register/open-current')
    getOpenRegister(@Query('companyId') companyId: string) {
        return this.cashFlowService.getOpenRegister(parseInt(companyId));
    }

    // @Permissions('cashflow.manage')
    @Post('register/open')
    openCashRegister(
        @Body() openDto: OpenCashRegisterDto,
        @Query('companyId') companyId: string,
        @Query('code') code: string,
        @Req() req: any,
    ) {
        const user = req.user?.username || 'System';
        return this.cashFlowService.openCashRegister(
            parseInt(companyId),
            code,
            openDto,
            user,
        );
    }

    // @Permissions('cashflow.manage')
    @Post('register/close')
    closeCashRegister(
        @Body() closeDto: CloseCashRegisterDto,
        @Query('companyId') companyId: string,
        @Query('code') code: string,
        @Req() req: any,
    ) {
        const user = req.user?.username || 'System';
        return this.cashFlowService.closeCashRegister(
            parseInt(companyId),
            code,
            closeDto,
            user,
        );
    }

    // @Permissions('cashflow.read')
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

    // @Permissions('cashflow.manage')
    @Post('transactions')
    createTransaction(
        @Body() transactionDto: CashFlowTransactionDto,
        @Query('companyId') companyId: string,
        @Req() req: any,
        @Query('cashRegisterId') cashRegisterId?: string,

    ) {
        const user = req.user?.username || 'System';

        // Obtener caja activa si no se especifica
        let registerId: number | undefined;
        if (cashRegisterId) {
            registerId = parseInt(cashRegisterId);
        }

        // TODO: Obtener balance actual
        const currentBalance = 0; // Implementar lógica para obtener balance

        return this.cashFlowService.registerTransaction({
            cashRegisterId: registerId,
            type: transactionDto.type,
            description: transactionDto.description,
            amount: transactionDto.amount,
            balanceAfter: currentBalance + transactionDto.amount,
            recordedBy: user,
            reference: transactionDto.reference,
            observations: transactionDto.observations,
        });
    }

    // @Permissions('cashflow.reports')
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

    // @Permissions('cashflow.read')
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


