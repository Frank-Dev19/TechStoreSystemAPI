import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn() id: number;
    @Column({ length: 128 }) name: string;
    @Column({ type: 'text', nullable: true }) description?: string;

    @OneToMany(() => Product, (p) => p.category) products: Product[];
}
