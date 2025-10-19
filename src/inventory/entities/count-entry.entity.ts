import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Count } from './count.entity';
import { Product } from './product.entity';
import { Lot } from './lot.entity';

@Entity('count_entries')
@Unique(['countId', 'productId', 'lotId'])
export class CountEntry {
    @PrimaryGeneratedColumn() id: number;

    @ManyToOne(() => Count) count: Count;
    @Column() countId: number;

    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @ManyToOne(() => Lot, { nullable: true }) lot?: Lot | null;
    @Column({ nullable: true }) lotId?: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 4 }) qtyCounted: number;
    @Column({ length: 64 }) countedBy: string;
    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) countedAt: Date;
    @Column({ type: 'text', nullable: true }) notes?: string | null;
}
