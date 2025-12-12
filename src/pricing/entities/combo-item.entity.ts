// src/pricing/entities/combo-item.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Combo } from './combo.entity';
import { Product } from 'src/inventory/entities/product.entity';

@Entity({ name: 'combo_items' })
export class ComboItem {
    @PrimaryGeneratedColumn()   // sin unsigned
    id: number;

    // FK a combos.id
    @Column({ name: 'combo_id', type: 'int' })   // sin unsigned
    comboId: number;

    @ManyToOne(() => Combo, (c) => c.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'combo_id' })
    combo: Combo;

    // FK a products.id
    @Column({ name: 'product_id', type: 'int' })   // sin unsigned
    productId: number;

    @ManyToOne(() => Product, { eager: true, nullable: false })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ name: 'qty', type: 'decimal', precision: 14, scale: 4 })
    qty: number;
}
