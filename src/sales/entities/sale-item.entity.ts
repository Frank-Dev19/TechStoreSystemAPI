// src/sales/entities/sale-item.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Lot } from 'src/inventory/entities/lot.entity';

@Entity({ name: 'sale_items' })
export class SaleItem {
    // ANTES: bigint unsigned
    @PrimaryGeneratedColumn()
    id: number;

    // Debe coincidir con sales.id → también int por defecto
    @Column({ name: 'sale_id' })
    saleId: number;

    @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    // DEBE COINCIDIR CON products.id (int normal)
    @Column({ name: 'product_id' })
    productId: number;

    @ManyToOne(() => Product, { eager: true, nullable: false })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    // DEBE COINCIDIR CON lots.id (int normal)
    @Column({ name: 'lot_id', nullable: true })
    lotId?: number | null;

    @ManyToOne(() => Lot, { eager: true, nullable: true })
    @JoinColumn({ name: 'lot_id' })
    lot?: Lot | null;

    @Column({ name: 'description', length: 255 })
    description: string;

    @Column({
        name: 'quantity',
        type: 'decimal',
        precision: 14,
        scale: 4,
    })
    quantity: number;

    @Column({
        name: 'unit_price',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    unitPrice: number;

    @Column({
        name: 'discount',
        type: 'decimal',
        precision: 16,
        scale: 6,
        default: 0,
    })
    discount: number;

    @Column({
        name: 'tax_amount',
        type: 'decimal',
        precision: 16,
        scale: 6,
        default: 0,
    })
    taxAmount: number;

    @Column({
        name: 'total',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    total: number;

    @Column({
        name: 'serial_count',
        type: 'int',
        default: 0,
    })
    serialCount: number;
}
