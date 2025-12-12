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
import { PaymentMethod } from '../enums/payment-method.enum';

@Entity({ name: 'sale_payments' })
export class SalePayment {
    // ANTES: bigint unsigned
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'sale_id' })
    saleId: number;

    @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'method', length: 20 })
    method: PaymentMethod;

    @Column({ name: 'amount', type: 'decimal', precision: 16, scale: 2 })
    amount: number;

    @Column({ name: 'payment_date', type: 'datetime', nullable: true })
    paymentDate?: Date | null;

    @Column({ name: 'reference', type: 'varchar', length: 100, nullable: true })
    reference?: string | null;

    @Column({ name: 'observations', type: 'text', nullable: true })
    observations?: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt: Date;
}
