import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Count } from './count.entity';
import { Product } from './product.entity';
import { Lot } from './lot.entity';

@Entity('count_snapshots')
export class CountSnapshot {
    @PrimaryGeneratedColumn() id: number;

    @ManyToOne(() => Count) count: Count;
    @Column() countId: number;

    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @ManyToOne(() => Lot, { nullable: true }) lot?: Lot | null;
    @Column({ nullable: true }) lotId?: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 4 }) qtySystem: number;
    @Column({ type: 'decimal', precision: 14, scale: 4 }) avgCostAtFreeze: number;
    @Column({ type: 'decimal', precision: 16, scale: 4 }) totalCostAtFreeze: number;

    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) snapshotDate: Date;
}
