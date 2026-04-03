import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Product } from 'src/inventory/entities/product.entity';
import { Category } from 'src/inventory/entities/category.entity';

/**
 * Configuración de márgenes de utilidad y rebaja permitida.
 * Prioridad de resolución:
 *   1) Producto específico (productId NOT NULL)
 *   2) Categoría (categoryId NOT NULL, productId NULL)
 *   3) Global (ambos NULL)
 */
@Entity({ name: 'pricing_configs' })
export class PricingConfig {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;

    // Scope: producto específico (máxima prioridad)
    @Column({ type: 'int', nullable: true })
    productId: number | null;

    @ManyToOne(() => Product, { eager: false, nullable: true, onDelete: 'CASCADE' })
    product: Product | null;

    // Scope: categoría (prioridad media)
    @Column({ type: 'int', nullable: true })
    categoryId: number | null;

    @ManyToOne(() => Category, { eager: false, nullable: true, onDelete: 'CASCADE' })
    category: Category | null;

    // % Utilidad Precio Público (ej: 15.00 → 15%)
    @Column({ name: 'profit_margin_pct', type: 'decimal', precision: 8, scale: 4, default: 15 })
    profitMarginPct: number;

    // % Rebaja Permitida máxima (ej: 7.00 → 7%)
    @Column({ name: 'max_discount_pct', type: 'decimal', precision: 8, scale: 4, default: 7 })
    maxDiscountPct: number;

    @Column({ name: 'is_active', type: 'tinyint', default: 1 })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
