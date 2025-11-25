import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Service } from './service.entity';

/**
 * SERVICE CATEGORY
 * ----------------
 * Agrupa y clasifica los servicios ofrecidos (ej: Mantenimiento, Soporte, Instalación).
 * Mejores prácticas:
 * - Mantener un catálogo jerárquico simple (sin anidamiento profundo).
 * - Usar el campo `code` como clave funcional estable (para integraciones).
 * - Controlar baja lógica mediante `isActive` y `deletedAt`.
 */
@Entity('service_categories')
export class ServiceCategory {
  /** PK autoincremental */
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  /** Código interno único (para integraciones o seeders) */
  @Column({ length: 64, unique: true })
  code: string;

  /** Nombre legible de la categoría (visible al usuario) */
  @Column({ length: 256 })
  name: string;

  /** Descripción opcional (propósito o alcance de la categoría) */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Activa/inactiva la categoría sin eliminarla físicamente */
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

  /**
   * Relación 1:N con Service
   * Si una categoría se elimina, sus servicios deben reasignarse o quedar huérfanos según política de negocio.
   */
  @OneToMany(() => Service, (service) => service.category)
  services: Service[];
}
