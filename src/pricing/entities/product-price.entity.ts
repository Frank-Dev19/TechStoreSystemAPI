// src/pricing/entities/product-price.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    Index,
} from 'typeorm';
import { Product } from 'src/inventory/entities/product.entity';
import { PriceList } from './price-list.entity';

@Entity({ name: 'product_prices' })
@Index(['productId', 'priceListId', 'minQty', 'maxQty'], { unique: true })
export class ProductPrice {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;

    // 👇 igual que products.id -> int (sin unsigned)
    @Column({ type: 'int' })
    productId: number;

    @ManyToOne(() => Product, { eager: true, nullable: false })
    product: Product;

    // 👇 aquí sí unsigned porque price_lists.id es unsigned
    @Column({ type: 'int', unsigned: true })
    priceListId: number;

    @ManyToOne(() => PriceList, (pl) => pl.productPrices, {
        eager: true,
        nullable: false,
    })
    priceList: PriceList;

    @Column({ name: 'unit_price', type: 'decimal', precision: 16, scale: 6 })
    unitPrice: number;

    @Column({ name: 'currency_code', length: 3, default: 'PEN' })
    currencyCode: string;

    @Column({ name: 'min_qty', type: 'decimal', precision: 14, scale: 4 })
    minQty: number;

    @Column({
        name: 'max_qty',
        type: 'decimal',
        precision: 14,
        scale: 4,
        nullable: true,
    })
    maxQty?: number | null;

    // @Column({ name: 'valid_from', type: 'datetime', nullable: true })
    // validFrom?: Date | null;

    // @Column({ name: 'valid_to', type: 'datetime', nullable: true })
    // validTo?: Date | null;

    @Column({ name: 'is_active', type: 'tinyint', default: 1 })
    isActive: boolean;
}
