import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
//import { Product } from './product.entity';
import { Product } from './product.entity';

@Entity('units')
@Unique(['code'])
export class Unit {
    @PrimaryGeneratedColumn() id: number;
    @Column({ length: 16 }) code: string;
    @Column({ length: 64 }) name: string;
    @Column({ length: 16 }) abbreviation: string;

    @OneToMany(() => Product, (p) => p.baseUnit) products: Product[];
}
