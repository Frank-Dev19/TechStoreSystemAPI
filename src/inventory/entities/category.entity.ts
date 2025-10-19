import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from './product.entity';

@Entity('categories')
@Unique(['code'])
export class Category {
    @PrimaryGeneratedColumn() id: number;
    @Column({ length: 32 }) code: string;         // visible en front
    @Column({ length: 128 }) name: string;
    @Column({ type: 'text', nullable: true }) description?: string;

    @OneToMany(() => Product, (p) => p.category) products: Product[];
}
