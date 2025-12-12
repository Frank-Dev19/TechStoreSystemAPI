// src/sales/entities/sale.entity.ts
import {
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Index,
} from 'typeorm';
import { BusinessPartner } from 'src/business-partner/entities/business-partner.entity';
import { SaleItem } from './sale-item.entity';
import { SalePayment } from './sale-payment.entity';
import { type SaleStatus } from '../enums/sale-status.enum';

@Entity({ name: 'sales' })
@Index(['companyId', 'series', 'number'], { unique: true })
export class Sale {
    // ANTES: @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    @PrimaryGeneratedColumn()
    id: number;

    // ANTES: bigint unsigned
    @Column({ name: 'company_id' })
    companyId: number;

    // Cliente (BusinessPartner)
    @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
    customerId: number;

    @ManyToOne(() => BusinessPartner, { eager: false, nullable: false })
    @JoinColumn({ name: 'customer_id' })
    customer: BusinessPartner;

    @Column({ name: 'document_type', length: 30 })
    documentType: string;

    @Column({ name: 'series', length: 10 })
    series: string;

    @Column({ name: 'number', length: 15 })
    number: string;

    @Column({ name: 'issue_date', type: 'date' })
    issueDate: string; // 'YYYY-MM-DD'

    @Column({ name: 'due_date', type: 'date', nullable: true })
    dueDate?: string | null;

    @Column({ name: 'currency', length: 3 })
    currency: string; // 'PEN' | 'USD' | etc.

    @Column({
        name: 'exchange_rate',
        type: 'decimal',
        precision: 10,
        scale: 4,
        default: 1,
    })
    exchangeRate: number;

    // Totales
    @Column({
        name: 'subtotal',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
    })
    subtotal: number;

    @Column({
        name: 'tax_amount',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
    })
    taxAmount: number;

    @Column({
        name: 'total',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
    })
    total: number;

    @Column({
        name: 'tax_rate',
        type: 'decimal',
        precision: 5,
        scale: 4,
        default: 0.18,
    })
    taxRate: number;

    @Column({ name: 'status', length: 16, default: 'DRAFT' })
    status: SaleStatus;

    @Column({ name: 'observations', type: 'text', nullable: true })
    observations?: string | null;

    @Column({
        name: 'created_by',
        type: 'varchar',
        length: 100,
        nullable: true,
    })
    createdBy?: string | null;

    @Column({
        name: 'cancelled_by',
        type: 'varchar',
        length: 100,
        nullable: true,
    })
    cancelledBy?: string | null;

    @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
    cancelledReason?: string | null;

    @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
    cancelledAt?: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
    deletedAt?: Date | null;

    @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
    items: SaleItem[];

    @OneToMany(() => SalePayment, (p) => p.sale, { cascade: true })
    payments: SalePayment[];
}
