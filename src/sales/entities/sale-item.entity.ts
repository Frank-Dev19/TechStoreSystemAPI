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
import { Service } from 'src/service-catalog/entities/service.entity';

@Entity({ name: 'sale_items' })
export class SaleItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'sale_id' })
    saleId: number;

    @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'item_type', type: 'varchar', length: 16, default: 'PRODUCT' })
    itemType: 'PRODUCT' | 'SERVICE';

    @Column({ name: 'product_id', nullable: true })
    productId?: number | null;

    @ManyToOne(() => Product, { eager: true, nullable: true })
    @JoinColumn({ name: 'product_id' })
    product?: Product | null;

    @Column({ name: 'service_id', type: 'int', unsigned: true, nullable: true })
    serviceId?: number | null;

    @ManyToOne(() => Service, { eager: true, nullable: true })
    @JoinColumn({ name: 'service_id' })
    service?: Service | null;

    @Column({ name: 'service_code_snapshot', type: 'varchar', length: 64, nullable: true })
    serviceCodeSnapshot?: string | null;

    @Column({ name: 'service_name_snapshot', type: 'varchar', length: 256, nullable: true })
    serviceNameSnapshot?: string | null;

    @Column({ name: 'description_snapshot', type: 'varchar', length: 256, nullable: true })
    descriptionSnapshot?: string | null;

    @Column({ name: 'lot_id', nullable: true })
    lotId?: number | null;

    @ManyToOne(() => Lot, { eager: true, nullable: true })
    @JoinColumn({ name: 'lot_id' })
    lot?: Lot | null;

    // Información de cálculo
    @Column({
        name: 'base_unit_price',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    baseUnitPrice: number;

    @Column({
        name: 'final_unit_price',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    finalUnitPrice: number;

    @Column({
        name: 'quantity',
        type: 'decimal',
        precision: 14,
        scale: 4,
    })
    quantity: number;

    @Column({
        name: 'discount_amount',
        type: 'decimal',
        precision: 16,
        scale: 6,
        default: 0,
    })
    discountAmount: number;

    @Column({
        name: 'tax_amount',
        type: 'decimal',
        precision: 16,
        scale: 6,
        default: 0,
    })
    taxAmount: number;

    @Column({
        name: 'line_total',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    lineTotal: number;

    // Para productos serializados
    @Column({
        name: 'serial_count',
        type: 'int',
        default: 0,
    })
    serialCount: number;

    @Column({
        name: 'is_combo_item',
        type: 'boolean',
        default: false,
    })
    isComboItem: boolean;

    @Column({ name: 'combo_id', type: 'int', nullable: true })
    comboId?: number | null;
}
