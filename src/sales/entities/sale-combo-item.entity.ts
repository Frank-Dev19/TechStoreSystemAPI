// src/sales/entities/sale-combo-item.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { SaleItem } from './sale-item.entity';
import { Combo } from 'src/pricing/entities/combo.entity';
import { Product } from 'src/inventory/entities/product.entity';

@Entity({ name: 'sale_combo_items' })
export class SaleComboItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'sale_id' })
    saleId: number;

    @ManyToOne(() => Sale, (sale) => sale.comboItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'sale_item_id', nullable: true })
    saleItemId?: number | null;

    @ManyToOne(() => SaleItem, { nullable: true })
    @JoinColumn({ name: 'sale_item_id' })
    saleItem?: SaleItem | null;

    @Column({ name: 'combo_id' })
    comboId: number;

    @ManyToOne(() => Combo, { eager: true })
    @JoinColumn({ name: 'combo_id' })
    combo: Combo;

    @Column({ name: 'product_id' })
    productId: number;

    @ManyToOne(() => Product, { eager: true })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({
        name: 'qty_in_combo',
        type: 'decimal',
        precision: 14,
        scale: 4,
    })
    qtyInCombo: number;

    @Column({
        name: 'unit_price_at_sale',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    unitPriceAtSale: number;

    @Column({
        name: 'combo_savings',
        type: 'decimal',
        precision: 16,
        scale: 6,
        default: 0,
    })
    comboSavings: number;
}