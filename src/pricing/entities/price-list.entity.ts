// src/pricing/entities/price-list.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    Index,
    OneToMany,
} from 'typeorm';
import { PriceListType } from '../enums/price-list-type.enum';
import { ProductPrice } from './product-price.entity';
import { DiscountRule } from './discount-rule.entity';

@Entity({ name: 'price_lists' })
@Index(['code'], { unique: true })
export class PriceList {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;

    @Column({ length: 32 })
    code: string; // RETAIL, WHOLESALE, etc.

    @Column({ length: 128 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    @Column({ type: 'varchar', length: 16 })
    type: PriceListType;

    @Column({ type: 'tinyint', default: 0 })
    isDefault: boolean;

    @Column({ type: 'datetime', nullable: true })
    activeFrom?: Date | null;

    @Column({ type: 'datetime', nullable: true })
    activeTo?: Date | null;

    @Column({ type: 'tinyint', default: 1 })
    isActive: boolean;

    @OneToMany(() => ProductPrice, (pp) => pp.priceList)
    productPrices: ProductPrice[];

    @OneToMany(() => DiscountRule, (dr) => dr.priceList)
    discountRules: DiscountRule[];
}
