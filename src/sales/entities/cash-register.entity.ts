// src/sales/entities/cash-register.entity.ts
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';

import { CashFlowTransaction } from './cash-flow-transaction.entity';
import { Sale } from './sale.entity';

export type CashRegisterStatus = 'CLOSED' | 'OPEN' | 'COUNTING';

// ✅ Transformer reutilizable para todos los campos decimal
const decimalTransformer = {
    to: (value: number) => value,
    from: (value: string) => (value !== null && value !== undefined ? parseFloat(value) : null),
};

@Entity({ name: 'cash_registers' })
export class CashRegister {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id' })
    companyId: number;

    @Column({ name: 'code', length: 32 })
    code: string;

    @Column({ name: 'name', length: 128 })
    name: string;

    @Column({
        name: 'opening_balance',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    openingBalance: number;

    @Column({
        name: 'current_balance',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    currentBalance: number;

    @Column({
        name: 'expected_balance',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    expectedBalance: number;

    @Column({
        name: 'total_cash',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    totalCash: number;

    @Column({
        name: 'total_card',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    totalCard: number;

    @Column({
        name: 'total_transfer',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    totalTransfer: number;

    @Column({
        name: 'total_yape',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    totalYape: number;

    @Column({
        name: 'total_plin',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer, // ✅
    })
    totalPlin: number;

    @Column({
        name: 'total_returns',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
        transformer: decimalTransformer,
    })
    totalReturns: number;

    @Column({ name: 'status', length: 16, default: 'CLOSED' })
    status: CashRegisterStatus;

    @Column({ name: 'opened_by', type: 'varchar', length: 100, nullable: true })
    openedBy?: string | null;

    @Column({ name: 'opened_at', type: 'datetime', nullable: true })
    openedAt?: Date | null;

    @Column({ name: 'closed_by', type: 'varchar', length: 100, nullable: true })
    closedBy?: string | null;

    @Column({ name: 'closed_at', type: 'datetime', nullable: true })
    closedAt?: Date | null;

    @Column({ name: 'closing_observations', type: 'text', nullable: true })
    closingObservations?: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt: Date;

    @OneToMany(() => CashFlowTransaction, (t) => t.cashRegister)
    transactions: CashFlowTransaction[];

    @OneToMany(() => Sale, (s) => s.cashRegister)
    sales: Sale[];
}