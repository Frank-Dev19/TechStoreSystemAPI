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
import { Client } from 'src/clients/entities/client.entity';
import { SaleItem } from './sale-item.entity';
import { SalePayment } from './sale-payment.entity';
import { SaleLineDiscount } from './sale-line-discount.entity';
import { SaleComboItem } from './sale-combo-item.entity';
import { DocumentSeries } from './document-series.entity';
import { SaleType } from '../enums/sale-type.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { DocumentType } from '../enums/document-type.enum';
import { CashRegister } from './cash-register.entity';

// export type SaleStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';
// export type SaleType = 'PRODUCT' | 'COMBO' | 'MIXED';
// Tipo tributario interno alineado a comprobantes SUNAT.

@Entity({ name: 'sales' })
@Index(['companyId', 'series', 'number'], { unique: true })
export class Sale {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id' })
    companyId: number;

    @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
    customerId: number;

    @ManyToOne(() => Client, { eager: true, nullable: false })
    @JoinColumn({ name: 'customer_id' })
    customer: Client;

    // Caja Registradora
    @Column({ name: 'cash_register_id', nullable: true })
    cashRegisterId?: number | null;

    @ManyToOne(() => CashRegister, { nullable: true })
    @JoinColumn({ name: 'cash_register_id' })
    cashRegister?: CashRegister | null;


    // Tipo de venta
    @Column({ name: 'sale_type', length: 16, default: 'PRODUCT' })
    saleType: SaleType;

    // Comprobante
    @Column({ name: 'document_type', length: 16 })
    documentType: DocumentType;

    @Column({ name: 'document_series_id', nullable: true })
    documentSeriesId?: number | null;

    @ManyToOne(() => DocumentSeries, { nullable: true })
    @JoinColumn({ name: 'document_series_id' })
    documentSeries?: DocumentSeries | null;

    @Column({ name: 'series', length: 10 })
    series: string;

    @Column({ name: 'number', length: 15 })
    number: string;

    @Column({ name: 'issue_date', type: 'date' })
    issueDate: string;

    @Column({ name: 'due_date', type: 'date', nullable: true })
    dueDate?: string | null;

    // Precios y descuentos
    @Column({ name: 'price_list_code', length: 32, nullable: true })
    priceListCode?: string;

    @Column({
        name: 'apply_auto_discounts',
        type: 'boolean',
        default: true,
    })
    applyAutoDiscounts: boolean;

    @Column({
        name: 'base_subtotal',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
    })
    baseSubtotal: number;  // Subtotal ANTES de descuentos

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
        name: 'discount_total',
        type: 'decimal',
        precision: 16,
        scale: 2,
        default: 0,
    })
    discountTotal: number;

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

    // Estado
    @Column({ name: 'status', length: 16, default: 'DRAFT' })
    status: SaleStatus;

    // Información adicional
    @Column({ name: 'observations', type: 'text', nullable: true })
    observations?: string | null;

    @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
    createdBy?: string | null;

    @Column({ name: 'confirmed_by', type: 'varchar', length: 100, nullable: true })
    confirmedBy?: string | null;

    @Column({ name: 'cancelled_by', type: 'varchar', length: 100, nullable: true })
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

    // Relaciones
    @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
    items: SaleItem[];

    @OneToMany(() => SalePayment, (p) => p.sale, { cascade: true })
    payments: SalePayment[];

    @OneToMany(() => SaleLineDiscount, (d) => d.sale, { cascade: true })
    lineDiscounts: SaleLineDiscount[];

    @OneToMany(() => SaleComboItem, (c) => c.sale, { cascade: true })
    comboItems: SaleComboItem[];
}
