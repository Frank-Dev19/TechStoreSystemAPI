import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    Index,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 * Configuración de impuestos del sistema.
 * - IGV (18%) → se aplica al precio de venta, lo paga el cliente
 * - RENTA (1.5%) → se calcula sobre ingresos mensuales, lo paga la empresa
 */
@Entity({ name: 'tax_configs' })
@Index(['code'], { unique: true })
export class TaxConfig {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;

    // Código único: 'IGV', 'RENTA'
    @Column({ length: 32 })
    code: string;

    // Nombre descriptivo
    @Column({ length: 128 })
    name: string;

    // Tasa porcentual (ej: 18.00 para IGV, 1.50 para Renta)
    @Column({ name: 'rate_pct', type: 'decimal', precision: 8, scale: 4 })
    ratePct: number;

    // Si es true, el usuario no puede editar este impuesto (ej: IGV)
    @Column({ name: 'is_fixed', type: 'tinyint', default: 0 })
    isFixed: boolean;

    // Dónde se aplica:
    //   SALE_PRICE → sobre cada venta (IGV)
    //   MONTHLY_REVENUE → sobre ingresos mensuales (Renta)
    @Column({ name: 'applies_to', length: 32, default: 'SALE_PRICE' })
    appliesTo: string;

    @Column({ name: 'is_active', type: 'tinyint', default: 1 })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
