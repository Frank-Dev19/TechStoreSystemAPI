import {
    Column, CreateDateColumn, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn, OneToMany
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { UserPermission } from './user-permission.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    name: string;

    @Column()
    passwordHash: string;

    @ManyToMany(() => Role, { eager: true })
    @JoinTable()
    roles: Role[];

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;


    @OneToMany(() => UserPermission, (up) => up.user, { eager: true })
    overrides: UserPermission[];

}
