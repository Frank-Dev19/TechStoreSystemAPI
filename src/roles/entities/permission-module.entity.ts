import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('permission_modules')
export class PermissionModule {
    @PrimaryGeneratedColumn()
    id: number;

    @Index('UQ_permission_modules_module_key', { unique: true })
    @Column({ name: 'module_key', type: 'varchar', length: 64 })
    moduleKey: string;

    @Column({ type: 'varchar', length: 100 })
    label: string;                // ej: 'Usuarios', 'Roles', 'Auditoría'

    @Column({ type: 'int', default: 0 })
    sortOrder: number;            // orden para UI

    @Column({ type: 'varchar', length: 64, nullable: true })
    icon?: string | null;         // nombre de icono para UI (opcional)

    @UpdateDateColumn()
    updatedAt: Date;

    @CreateDateColumn()
    createdAt: Date;
}
