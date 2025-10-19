import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from './product.entity';
import { Lot } from './lot.entity';

@Entity('stock')
@Unique(['productId', 'lotId'])
export class Stock {
    @PrimaryGeneratedColumn() id: number;

    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @ManyToOne(() => Lot, { nullable: true }) lot?: Lot | null;
    @Column({ nullable: true }) lotId?: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 }) qtyOnHand: number;
    @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 }) avgUnitCost: number;
    @Column({ type: 'decimal', precision: 16, scale: 4, default: 0 }) totalCost: number;

    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) updatedAt: Date;
}
