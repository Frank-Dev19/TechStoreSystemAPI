// src/pricing/entities/discount-rule.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
} from 'typeorm';
import { Product } from 'src/inventory/entities/product.entity';
import { Category } from 'src/inventory/entities/category.entity';
import { PriceList } from './price-list.entity';
import { DiscountType } from '../enums/discount-type.enum';

@Entity({ name: 'discount_rules' })
export class DiscountRule {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;

    @Column({ length: 128 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    // Scope: por producto
    @Column({ name: 'product_id', type: 'int', unsigned: true, nullable: true })
    productId?: number | null;

    @ManyToOne(() => Product, { eager: false, nullable: true })
    product?: Product | null;

    // Scope: por categoría
    @Column({ name: 'category_id', type: 'int', unsigned: true, nullable: true })
    categoryId?: number | null;

    @ManyToOne(() => Category, { eager: false, nullable: true })
    category?: Category | null;

    // Scope: por lista de precios
    @Column({
        name: 'price_list_id',
        type: 'int',
        unsigned: true,
        nullable: true,
    })
    priceListId?: number | null;

    @ManyToOne(() => PriceList, (pl) => pl.discountRules, {
        eager: false,
        nullable: true,
    })
    priceList?: PriceList | null;

    @Column({ name: 'discount_type', type: 'varchar', length: 16 })
    discountType: DiscountType; // PERCENT | FIXED

    @Column({ type: 'decimal', precision: 10, scale: 4 })
    amount: number; // % o monto fijo por unidad

    @Column({
        name: 'min_qty',
        type: 'decimal',
        precision: 14,
        scale: 4,
        nullable: true,
    })
    minQty?: number | null;

    @Column({
        name: 'max_qty',
        type: 'decimal',
        precision: 14,
        scale: 4,
        nullable: true,
    })
    maxQty?: number | null;

    @Column({ name: 'auto_apply', type: 'tinyint', default: 1 })
    autoApply: boolean;

    @Column({ name: 'requires_permission', type: 'varchar', length: 64, nullable: true })
    requiresPermission?: string | null;

    @Column({ name: 'starts_at', type: 'datetime', nullable: true })
    startsAt?: Date | null;

    @Column({ name: 'ends_at', type: 'datetime', nullable: true })
    endsAt?: Date | null;

    @Column({ type: 'int', default: 0 })
    priority: number;

    @Column({ name: 'is_exclusive', type: 'tinyint', default: 0 })
    isExclusive: boolean;

    @Column({ name: 'is_active', type: 'tinyint', default: 1 })
    isActive: boolean;
}
