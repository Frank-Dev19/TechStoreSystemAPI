// src/sales/services/cash-flow.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CashRegister } from '../entities/cash-register.entity';
import { CashFlowTransaction } from '../entities/cash-flow-transaction.entity';
import { Sale } from '../entities/sale.entity';
import { OpenCashRegisterDto } from '../dto/open-cash-register.dto';
import { CloseCashRegisterDto } from '../dto/close-cash-register.dto';
import { CashFlowTransactionDto } from '../dto/cash-flow-transaction.dto';
import { SaleStatus } from '../enums/sale-status.enum';


@Injectable()
export class CashFlowService {
    constructor(
        @InjectRepository(CashRegister)
        private readonly cashRegisterRepo: Repository<CashRegister>,
        @InjectRepository(CashFlowTransaction)
        private readonly transactionRepo: Repository<CashFlowTransaction>,
        @InjectRepository(Sale)
        private readonly saleRepo: Repository<Sale>,
    ) { }

    // =========================
    // GESTIÓN DE CAJA
    // =========================
    async getCashRegister(companyId: number, code?: string) {
        const where: any = { companyId };
        if (code) {
            where.code = code;
        }

        const register = await this.cashRegisterRepo.findOne({
            where,
            relations: ['transactions'],
            order: { createdAt: 'DESC' },
        });

        return register;
    }

    // Admin: list all registers for a company
    async getAllRegisters(companyId: number) {
        return this.cashRegisterRepo.find({
            where: { companyId },
            relations: ['transactions'],
            order: { createdAt: 'DESC' },
        });
    }

    // Admin: get the currently open register for a company
    async getOpenRegister(companyId: number) {
        const register = await this.cashRegisterRepo.findOne({ where: { companyId, status: 'OPEN' } });
        return register ?? null;
    }

    async openCashRegister(
        companyId: number,
        code: string,
        openDto: OpenCashRegisterDto,
        user: string
    ) {
        // Verificar si ya hay una caja abierta
        const existingOpen = await this.cashRegisterRepo.findOne({
            where: { companyId, status: 'OPEN' },
        });

        if (existingOpen) {
            throw new BadRequestException(
                `Ya existe una caja abierta: ${existingOpen.name}. Ciérrela primero.`
            );
        }

        let register = await this.cashRegisterRepo.findOne({
            where: { companyId, code },
        });

        if (!register) {
            register = this.cashRegisterRepo.create({
                companyId,
                code,
                name: `Caja ${code}`,
            });
        }

        if (register.status === 'OPEN') {
            throw new BadRequestException('La caja ya está abierta');
        }

register.openingBalance = openDto.openingBalance;
        register.currentBalance = openDto.openingBalance;
        register.expectedBalance = openDto.openingBalance;
        
        // Inicializar totales por método de pago
        register.totalCash = 0;
        register.totalCard = 0;
        register.totalTransfer = 0;
        register.totalYape = 0;
        register.totalPlin = 0;
        
        register.status = 'OPEN';
        register.openedBy = user;
        register.openedAt = new Date();

        const savedRegister = await this.cashRegisterRepo.save(register);

        // Registrar transacción de apertura
        await this.registerTransaction({
            cashRegisterId: savedRegister.id,
            type: 'OPENING',
            description: `Apertura de caja ${savedRegister.name}`,
            amount: openDto.openingBalance,
            balanceAfter: savedRegister.currentBalance,
            recordedBy: user,
        });

        return savedRegister;
    }

    async closeCashRegister(
        companyId: number,
        code: string,
        closeDto: CloseCashRegisterDto,
        user: string
    ) {
        const register = await this.cashRegisterRepo.findOne({
            where: { companyId, code, status: 'OPEN' },
        });

        if (!register) {
            throw new NotFoundException('Caja no encontrada o no está abierta');
        }

        // Obtener ventas de la caja desde la apertura
        const sales = await this.saleRepo.find({
            where: {
                companyId,
                status: SaleStatus.CONFIRMED,
                createdAt: Between(register.openedAt!, new Date()),
            },
            relations: ['payments'],
        });

        // Calcular totales por forma de pago
        const paymentSummary = {
            cash: 0,
            card: 0,
            transfer: 0,
            yape: 0,
            plin: 0,
            credit: 0,
        };

        for (const sale of sales) {
            for (const payment of sale.payments) {
                const amount = Number(payment.amount);
                switch (payment.method) {
                    case 'CASH':
                        paymentSummary.cash += amount;
                        break;
                    case 'CARD':
                        paymentSummary.card += amount;
                        break;
                    case 'TRANSFER':
                        paymentSummary.transfer += amount;
                        break;
                    case 'YAPE':
                        paymentSummary.yape += amount;
                        break;
                    case 'PLIN':
                        paymentSummary.plin += amount;
                        break;
                    case 'CREDIT':
                        paymentSummary.credit += amount;
                        break;
                }
            }
        }

        // Calcular efectivo esperado
        const expectedCash = register.openingBalance + paymentSummary.cash;
        const cashDifference = closeDto.actualCash - expectedCash;

        // Actualizar caja
        register.status = 'CLOSED';
        register.closedBy = user;
        register.closedAt = new Date();
        register.currentBalance = closeDto.actualCash;
        register.expectedBalance = expectedCash;
        register.closingObservations = closeDto.observations || `Cierre de caja. Diferencia: ${cashDifference}`;

        const savedRegister = await this.cashRegisterRepo.save(register);

        // Registrar transacción de cierre
        await this.registerTransaction({
            cashRegisterId: savedRegister.id,
            type: 'CLOSING',
            description: `Cierre de caja ${savedRegister.name}`,
            amount: 0,
            balanceAfter: savedRegister.currentBalance,
            recordedBy: user,
        });

        return {
            register: savedRegister,
            summary: {
                salesCount: sales.length,
                salesTotal: sales.reduce((sum, s) => sum + Number(s.total), 0),
                paymentSummary,
                openingBalance: register.openingBalance,
                expectedCash,
                actualCash: closeDto.actualCash,
                cashDifference,
            },
        };
    }

    // =========================
    // TRANSACCIONES
    // =========================
    async registerTransaction(params: {
        cashRegisterId?: number;
        saleId?: number;
        type: string;
        subtype?: string;
        description: string;
        amount: number;
        balanceAfter?: number;
        recordedBy: string;
        reference?: string;
        observations?: string;
    }) {
        const transaction = this.transactionRepo.create({
            cashRegisterId: params.cashRegisterId,
            saleId: params.saleId,
            type: params.type as any,
            subtype: params.subtype as any,
            description: params.description,
            amount: params.amount,
            balanceAfter: params.balanceAfter,
            currency: 'PEN',
            exchangeRate: 1,
            reference: params.reference,
            recordedBy: params.recordedBy,
            recordedAt: new Date(),
        });

        return this.transactionRepo.save(transaction);
    }

    async getTransactions(companyId: number, filters: {
        dateFrom?: string;
        dateTo?: string;
        type?: string;
        subtype?: string;
        cashRegisterId?: number;
        page?: number;
        limit?: number;
    }) {
        const query = this.transactionRepo
            .createQueryBuilder('t')
            .leftJoinAndSelect('t.cashRegister', 'cr')
            .leftJoinAndSelect('t.sale', 's')
            .where('cr.companyId = :companyId', { companyId });

        if (filters.dateFrom) {
            query.andWhere('t.recordedAt >= :dateFrom', { dateFrom: filters.dateFrom });
        }

        if (filters.dateTo) {
            const dateToPlusOne = new Date(filters.dateTo);
            dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
            query.andWhere('t.recordedAt < :dateTo', { dateTo: dateToPlusOne.toISOString().split('T')[0] });
        }

        if (filters.type) {
            query.andWhere('t.type = :type', { type: filters.type });
        }

        if (filters.subtype) {
            query.andWhere('t.subtype = :subtype', { subtype: filters.subtype });
        }

        if (filters.cashRegisterId) {
            query.andWhere('t.cashRegisterId = :cashRegisterId', {
                cashRegisterId: filters.cashRegisterId
            });
        }

        const page = filters.page || 1;
        const limit = filters.limit || 20;

        const [data, total] = await query
            .orderBy('t.recordedAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // =========================
    // REPORTES
    // =========================
    async getDailyReport(companyId: number, date: string) {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        // Ventas del día
        const sales = await this.saleRepo.find({
            where: {
                companyId,
                status: SaleStatus.CONFIRMED,
                createdAt: Between(startDate, endDate),
            },
            relations: ['items', 'payments'],
        });

        // Transacciones del día
        const transactions = await this.transactionRepo.find({
            where: {
                recordedAt: Between(startDate, endDate),
            },
            relations: ['cashRegister'],
        });

        // Calcular totales
        const salesTotal = sales.reduce((sum, s) => sum + Number(s.total), 0);
        const salesCount = sales.length;

        const paymentBreakdown = {
            cash: 0,
            card: 0,
            transfer: 0,
            yape: 0,
            plin: 0,
            credit: 0,
        };

        for (const sale of sales) {
            for (const payment of sale.payments) {
                const amount = Number(payment.amount);
                switch (payment.method) {
                    case 'CASH':
                        paymentBreakdown.cash += amount;
                        break;
                    case 'CARD':
                        paymentBreakdown.card += amount;
                        break;
                    case 'TRANSFER':
                        paymentBreakdown.transfer += amount;
                        break;
                    case 'YAPE':
                        paymentBreakdown.yape += amount;
                        break;
                    case 'PLIN':
                        paymentBreakdown.plin += amount;
                        break;
                    case 'CREDIT':
                        paymentBreakdown.credit += amount;
                        break;
                }
            }
        }

        // Productos más vendidos
        const productSales = new Map<number, {
            productId: number;
            productName: string;
            quantity: number;
            amount: number;
        }>();

        for (const sale of sales) {
            for (const item of sale.items) {
                const productId = item.productId;
                const current = productSales.get(productId) || {
                    productId,
                    productName: item.product?.name || `Producto ${productId}`,
                    quantity: 0,
                    amount: 0,
                };

                current.quantity += Number(item.quantity);
                current.amount += Number(item.lineTotal);
                productSales.set(productId, current);
            }
        }

        const topProducts = Array.from(productSales.values())
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10);

        return {
            date,
            sales: {
                total: salesTotal,
                count: salesCount,
                average: salesCount > 0 ? salesTotal / salesCount : 0,
            },
            payments: paymentBreakdown,
            topProducts,
            transactions: transactions.map(t => ({
                id: t.id,
                type: t.type,
                description: t.description,
                amount: t.amount,
                recordedAt: t.recordedAt,
                cashRegister: t.cashRegister?.name,
            })),
        };
    }

    // =========================
    // MÉTRICAS DE FLUJO DE CAJA
    // =========================
    async getCashFlowMetrics(companyId: number, filters: {
        dateFrom?: string;
        dateTo?: string;
        cashRegisterId?: number;
    }) {
        const query = this.transactionRepo
            .createQueryBuilder('t')
            .leftJoinAndSelect('t.cashRegister', 'cr')
            .where('cr.companyId = :companyId', { companyId });

        if (filters.dateFrom) {
            query.andWhere('t.recordedAt >= :dateFrom', { dateFrom: filters.dateFrom });
        }

        if (filters.dateTo) {
            const dateToPlusOne = new Date(filters.dateTo);
            dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
            query.andWhere('t.recordedAt < :dateTo', { dateTo: dateToPlusOne.toISOString().split('T')[0] });
        }

        if (filters.cashRegisterId) {
            query.andWhere('t.cashRegisterId = :cashRegisterId', {
                cashRegisterId: filters.cashRegisterId
            });
        }

        const transactions = await query.orderBy('t.recordedAt', 'DESC').getMany();

        const metrics = {
            total: 0,
            cash: 0,
            card: 0,
            transfer: 0,
            yape: 0,
            plin: 0,
        };

        for (const t of transactions) {
            if (t.type === 'SALE' || t.type === 'INCOME') {
                metrics.total += Number(t.amount);
                
                switch (t.subtype) {
                    case 'CASH':
                        metrics.cash += Number(t.amount);
                        break;
                    case 'CARD':
                        metrics.card += Number(t.amount);
                        break;
                    case 'TRANSFER':
                        metrics.transfer += Number(t.amount);
                        break;
                    case 'YAPE':
                        metrics.yape += Number(t.amount);
                        break;
                    case 'PLIN':
                        metrics.plin += Number(t.amount);
                        break;
                }
            }
        }

        return metrics;
    }
}
