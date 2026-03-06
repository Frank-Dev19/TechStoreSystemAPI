import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from './product.entity';
import { Lot } from './lot.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

export type SerialStatus = 'IN_STOCK' | 'ISSUED' | 'DAMAGED' | 'LOST';

@Entity('serials')
@Unique(['serialCode'])
export class Serial {
    @PrimaryGeneratedColumn() id: number;
    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @Column({ length: 64 }) serialCode: string;
    @ManyToOne(() => Lot, { nullable: true }) lot?: Lot | null;
    @Column({ nullable: true }) lotId?: number | null;

    @ManyToOne(() => Supplier, { nullable: true }) supplier?: Supplier | null;
    @Column({
        type: 'bigint',
        unsigned: true,
        nullable: true
    })
    supplierId?: number | null;

    @Column({ type: 'varchar', length: 16, default: 'IN_STOCK' }) status: SerialStatus;
    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt: Date;
}
