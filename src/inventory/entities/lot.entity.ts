import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from './product.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity('lots')
@Unique(['productId', 'lotCode'])
export class Lot {
    @PrimaryGeneratedColumn() id: number;
    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @Column({ length: 64 }) lotCode: string;
    @Column({ type: 'date', nullable: true }) expirationDate?: string | null;

    @ManyToOne(() => Supplier, { nullable: true }) supplier?: Supplier | null;
    @Column({
        type: 'bigint',
        unsigned: true,
        nullable: true
    })
    supplierId?: number | null;

    // NOTA: el stock por lote NO se guarda aquí; vive en Stock.
    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt: Date;
}
