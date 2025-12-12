// src/pricing/entities/combo.entity.ts
import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    OneToMany,
    Index,
} from 'typeorm';
import { ComboType } from '../enums/combo-type.enum';
import { ComboItem } from './combo-item.entity';

@Entity({ name: 'combos' })
@Index(['code'], { unique: true })
export class Combo {
    @PrimaryGeneratedColumn()
    id: number;   // int normal, SIN unsigned

    @Column({ length: 32 })
    code: string;

    @Column({ length: 128 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    @Column({ name: 'combo_type', type: 'varchar', length: 16 })
    comboType: ComboType; // FIXED_PRICE | PERCENT

    @Column({
        name: 'combo_price',
        type: 'decimal',
        precision: 16,
        scale: 6,
        nullable: true,
    })
    comboPrice?: number | null; // si FIXED_PRICE

    @Column({
        name: 'discount_percent',
        type: 'decimal',
        precision: 10,
        scale: 4,
        nullable: true,
    })
    discountPercent?: number | null; // si PERCENT

    @Column({ name: 'auto_apply', type: 'tinyint', default: 0 })
    autoApply: boolean;

    @Column({ name: 'requires_permission', type: 'varchar', length: 64, nullable: true })
    requiresPermission?: string | null;

    @Column({ name: 'starts_at', type: 'datetime', nullable: true })
    startsAt?: Date | null;

    @Column({ name: 'ends_at', type: 'datetime', nullable: true })
    endsAt?: Date | null;

    @Column({ name: 'is_active', type: 'tinyint', default: 1 })
    isActive: boolean;

    @OneToMany(() => ComboItem, (ci) => ci.combo, { cascade: true })
    items: ComboItem[];
}
