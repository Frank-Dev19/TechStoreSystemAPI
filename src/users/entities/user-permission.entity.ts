import {
    Column,
    CreateDateColumn,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Permission } from 'src/roles/entities/permission.entity';

export type OverrideEffect = 'allow' | 'deny';

@Entity('user_permissions')
@Unique(['user', 'permission'])
export class UserPermission {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    user: User;

    @ManyToOne(() => Permission, { eager: true, onDelete: 'CASCADE' })
    permission: Permission;

    @Column({ type: 'enum', enum: ['allow', 'deny'] })
    effect: OverrideEffect;

    // Opcional: fecha de expiración (si no hay, no expira)
    @Column({ type: 'datetime', nullable: true })
    expiresAt: Date | null;

    // Opcional: scope (por ejemplo { storeId: 12 })
    @Column({ type: 'json', nullable: true })
    scope: Record<string, any> | null;

    @CreateDateColumn()
    createdAt: Date;
}
