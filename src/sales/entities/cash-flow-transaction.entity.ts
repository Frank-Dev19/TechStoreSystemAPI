// src/sales/entities/cash-flow-transaction.entity.ts
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { CashRegister } from './cash-register.entity';
import { Sale } from './sale.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionSubtype } from '../enums/transaction-subtype.enum';

@Entity({ name: 'cash_flow_transactions' })
export class CashFlowTransaction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'cash_register_id', nullable: true })
    cashRegisterId?: number | null;

    @ManyToOne(() => CashRegister, { nullable: true })
    @JoinColumn({ name: 'cash_register_id' })
    cashRegister?: CashRegister | null;

    @Column({ name: 'sale_id', nullable: true })
    saleId?: number | null;

    @ManyToOne(() => Sale, { nullable: true })
    @JoinColumn({ name: 'sale_id' })
    sale?: Sale | null;

    // USAMOS LOS ENUMS REALES AQUÍ
    @Column({ name: 'type', length: 16 })
    type: TransactionType;

    @Column({ name: 'subtype', type: 'varchar', length: 16, nullable: true })
    subtype?: TransactionSubtype | null;

    @Column({ name: 'description', length: 255 })
    description: string;

    @Column({
        name: 'amount',
        type: 'decimal',
        precision: 16,
        scale: 2,
    })
    amount: number;

    @Column({
        name: 'balance_after',
        type: 'decimal',
        precision: 16,
        scale: 2,
    })
    balanceAfter: number;

    @Column({ name: 'currency', length: 3, default: 'PEN' })
    currency: string;

    @Column({
        name: 'exchange_rate',
        type: 'decimal',
        precision: 10,
        scale: 4,
        default: 1,
    })
    exchangeRate: number;

    @Column({ name: 'reference', type: 'varchar', length: 100, nullable: true })
    reference?: string | null;

    @Column({ name: 'recorded_by', length: 100 })
    recordedBy: string;

    @CreateDateColumn({ name: 'recorded_at', type: 'datetime' })
    recordedAt: Date;
}