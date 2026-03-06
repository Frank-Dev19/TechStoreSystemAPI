import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Index } from 'typeorm';
import { Product } from './product.entity';
import { Lot } from './lot.entity';
import { Serial } from './serial.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

export type MovementType = 'IN' | 'OUT' | 'ADJ' | 'TRANSFER';

@Entity('movements')
@Index(['occurredAt'])
export class Movement {
    @PrimaryGeneratedColumn() id: number;

    @Column({ type: 'varchar', length: 8 }) type: MovementType;

    @ManyToOne(() => Product) product: Product;
    @Column() productId: number;

    @ManyToOne(() => Lot, { nullable: true }) lot?: Lot | null;
    @Column({ nullable: true }) lotId?: number | null;

    @ManyToOne(() => Serial, { nullable: true }) serial?: Serial | null;
    @Column({ nullable: true }) serialId?: number | null;

    @ManyToOne(() => Supplier, { nullable: true }) supplier?: Supplier | null;
    @Column({
        type: 'bigint',
        unsigned: true,
        nullable: true
    })
    supplierId?: number | null;

    @Column({ type: 'decimal', precision: 14, scale: 4 }) qty: number;        // siempre positiva en BE
    @Column({ type: 'decimal', precision: 14, scale: 4 }) unitCost: number;
    @Column({ type: 'decimal', precision: 14, scale: 4 }) totalCost: number;

    @Column({ length: 32 }) reasonCode: string; // COMPRA/VENTA/AJUSTE_INV/...

    @Column({ type: 'varchar', length: 32, nullable: true })
    sourceDocType?: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    sourceDocId?: string | null;

    @Column({ type: 'text', nullable: true }) notes?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    userCreated?: string | null;

    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) occurredAt: Date;

    // Saldos después del movimiento (general por producto)
    @Column({ type: 'decimal', precision: 14, scale: 4 }) balanceQtyPost: number;
    @Column({ type: 'decimal', precision: 16, scale: 4 }) balanceTotalCostPost: number;
    @Column({ type: 'decimal', precision: 14, scale: 4 }) balanceAvgCostPost: number;
}
