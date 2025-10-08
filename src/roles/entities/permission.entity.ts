import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PermissionModule } from './permission-module.entity';
@Entity('permissions')
export class Permission {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    code: string; // 'user.read', 'users.update', 'auditoria.delete'

    @Column()
    description: string;

    @Column({ name: 'action_key', type: 'varchar', length: 64 })
    actionKey: string;            // ej: 'read' | 'create' | 'update' | 'delete' | 'export'...

    @Column({ name: 'sort_order', type: 'int', default: 0 })
    sortOrder: number;

    @ManyToOne(() => PermissionModule, { eager: true, nullable: false })
    @JoinColumn({ name: 'module_id' })
    module: PermissionModule;     // módulo al que pertenece (users, role, suppliers, auditoria, etc.)
}
