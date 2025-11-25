import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ServiceCategory } from './service-category.entity';

/**
 * SERVICE
 * -------
 * Representa un servicio del catálogo comercial (ej: “Formateo de equipo”, “Mantenimiento preventivo”).
 * Contiene precio base, categoría y duración estimada.
 *
 * Mejores prácticas:
 * - Mantener `code` único y estable para integraciones.
 * - `price` y `estimatedDurationMinutes` son parámetros de referencia, no históricos (la cotización guarda el snapshot).
 * - Baja lógica controlada con `isActive` y `deletedAt`.
 */
@Entity('services')
export class Service {
  /** PK autoincremental */
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  /** Código único del servicio (clave funcional para integraciones o seeders) */
  @Column({ length: 64, unique: true })
  code: string;

  /** Nombre comercial del servicio */
  @Column({ length: 256 })
  name: string;

  /** Descripción libre (puede incluir condiciones, herramientas, etc.) */
  @Column({ type: 'text', nullable: true })
  description: string;

  /** FK a categoría del servicio (agrupador lógico) */
  @Column({ name: 'category_id', type: 'int', unsigned: true })
  categoryId: number;

  /**
   * Relación con ServiceCategory.
   * eager: false → carga bajo demanda (evita cargas circulares).
   */
  @ManyToOne(() => ServiceCategory, (category) => category.services, { eager: false })
  @JoinColumn({ name: 'category_id' })
  category: ServiceCategory;

  /** Precio base de referencia (se congela al generar la cotización) */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  /** Duración estimada en minutos (para planificación o SLA base) */
  @Column({ name: 'estimated_duration_minutes', type: 'int', nullable: true })
  estimatedDurationMinutes: number;

  /** Garantía asociada al servicio (en días) */
  @Column({ name: 'warranty_days', type: 'int', nullable: true })
  warrantyDays: number;

  /** Marca lógica de disponibilidad del servicio */
  @Column({ default: true })
  isActive: boolean;

  /** Auditoría de creación */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Auditoría de última actualización */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Baja lógica (soft delete) */
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date | null;
}
