// src/sales/entities/sale-payment.entity.ts
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Sale } from './sale.entity';

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'YAPE' | 'PLIN' | 'CREDIT';

@Entity({ name: 'sale_payments' })
export class SalePayment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'sale_id' })
    saleId: number;

    @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'method', length: 20 })
    method: PaymentMethod;

    @Column({
        name: 'amount',
        type: 'decimal',
        precision: 16,
        scale: 2,
    })
    amount: number;

    @Column({
        name: 'exchange_rate',
        type: 'decimal',
        precision: 10,
        scale: 4,
        default: 1,
    })
    exchangeRate: number;

    @Column({ name: 'currency', length: 3, default: 'PEN' })
    currency: string;

    @Column({ name: 'payment_date', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    paymentDate: Date;

    @Column({ name: 'reference', type: 'varchar', length: 100, nullable: true })
    reference?: string | null;

    @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
    bankName?: string | null;

    @Column({ name: 'card_type', type: 'varchar', length: 50, nullable: true })
    cardType?: string | null;

    @Column({ name: 'observations', type: 'text', nullable: true })
    observations?: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt: Date;
}