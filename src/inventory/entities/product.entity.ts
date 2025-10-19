import { Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';
import { Unit } from './unit.entity';
import { Lot } from './lot.entity';
import { Serial } from './serial.entity';
import { Stock } from './stock.entity';

@Entity('products')
@Index(['sku'], { unique: true })
export class Product {
    @PrimaryGeneratedColumn() id: number;

    @Column({ length: 64 }) sku: string;
    @Column({ length: 256 }) name: string;
    @Column({ type: 'text', nullable: true }) description?: string;

    @ManyToOne(() => Category, { eager: true }) category: Category;
    @Column() categoryId: number;

    // Mapeo front: unit_id -> baseUnitId
    @ManyToOne(() => Unit, { eager: true }) baseUnit: Unit;
    @Column() baseUnitId: number;

    @Column({ default: false }) isSerialized: boolean;
    @Column({ default: false }) managesExpiration: boolean;

    @Column({ type: 'int', default: 0 }) minStock: number;
    @Column({ type: 'int', default: 0 }) maxStock: number;
    @Column({ type: 'int', default: 0 }) reorderPoint: number;

    @OneToMany(() => Lot, (l) => l.product) lots: Lot[];
    @OneToMany(() => Serial, (s) => s.product) serials: Serial[];
    @OneToMany(() => Stock, (st) => st.product) stocks: Stock[];
}
