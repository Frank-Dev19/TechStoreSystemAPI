import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Count } from './count.entity';
import { Product } from './product.entity';
import { Lot } from './lot.entity';

@Entity('count_differences')
@Index(['countId', 'productId', 'lotId'], { unique: true })
export class CountDifference {
    @PrimaryGeneratedColumn() id: number;

    @ManyToOne(() => Count, { onDelete: 'CASCADE' }) count: Count;
    @Column() countId: number;

    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @ManyToOne(() => Lot, { nullable: true }) lot?: Lot | null;
    @Column({ nullable: true }) lotId?: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 4 }) qtySystem: number;
    @Column({ type: 'decimal', precision: 14, scale: 4 }) qtyCounted: number;
    @Column({ type: 'decimal', precision: 14, scale: 4 }) difference: number;

    @Column({ type: 'decimal', precision: 14, scale: 6 }) avgCostAtFreeze: number;
    @Column({ type: 'decimal', precision: 16, scale: 6 }) valueDifference: number;

    @CreateDateColumn({ type: 'datetime' }) calculatedAt: Date;
    @Column({ length: 64 }) calculatedBy: string;
}
