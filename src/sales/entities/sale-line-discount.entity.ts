// src/sales/entities/sale-line-discount.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { SaleItem } from './sale-item.entity';

export type DiscountSource = 'RULE_AUTO' | 'RULE_MANUAL' | 'COMBO' | 'MANUAL' | 'PROMOTION' | 'SELLER_DISCOUNT';

@Entity({ name: 'sale_line_discounts' })
export class SaleLineDiscount {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'sale_id' })
    saleId: number;

    @ManyToOne(() => Sale, (sale) => sale.lineDiscounts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'sale_item_id', nullable: true })
    saleItemId?: number | null;

    @ManyToOne(() => SaleItem, { nullable: true })
    @JoinColumn({ name: 'sale_item_id' })
    saleItem?: SaleItem | null;

    @Column({ name: 'discount_rule_id', type: 'int', unsigned: true, nullable: true })
    discountRuleId?: number | null;

    @Column({ name: 'discount_source', length: 16 })
    discountSource: DiscountSource;

    @Column({ name: 'name', length: 128 })
    name: string;

    @Column({
        name: 'amount',
        type: 'decimal',
        precision: 10,
        scale: 4,
    })
    amount: number; // Porcentaje o monto fijo

    @Column({ name: 'is_percent', type: 'boolean' })
    isPercent: boolean;

    @Column({
        name: 'discount_value',
        type: 'decimal',
        precision: 16,
        scale: 6,
    })
    discountValue: number; // Valor monetario del descuento

    @Column({
        name: 'priority',
        type: 'int',
        default: 0,
    })
    priority: number;
}