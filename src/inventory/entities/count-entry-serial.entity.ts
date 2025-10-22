// src/inventory/entities/count-entry-serial.entity.ts
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CountEntry } from './count-entry.entity';
import { Product } from './product.entity';
import { Lot } from './lot.entity';

@Entity('count_entry_serials')
@Unique(['entryId', 'serialCode'])
export class CountEntrySerial {
    @PrimaryGeneratedColumn() id: number;

    @ManyToOne(() => CountEntry, { onDelete: 'CASCADE' })
    entry: CountEntry;
    @Column() entryId: number;

    @Column({ length: 64 })
    serialCode: string;

    @ManyToOne(() => Product)
    product: Product;
    @Column()
    productId: number;

    @ManyToOne(() => Lot, { nullable: true })
    lot?: Lot | null;
    @Column({ nullable: true })
    lotId?: number | null;

    @CreateDateColumn({ type: 'datetime' })
    createdAt: Date;
}
