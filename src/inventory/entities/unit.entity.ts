import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
//import { Product } from './product.entity';
import { Product } from './product.entity';

@Entity('units')
export class Unit {
    @PrimaryGeneratedColumn() id: number;
    @Column({ length: 64 }) name: string;
    @Column({ length: 16 }) abbreviation: string;

    @OneToMany(() => Product, (p) => p.baseUnit) products: Product[];
}
