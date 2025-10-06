import {
    Column, CreateDateColumn, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn, DeleteDateColumn, OneToMany, ManyToOne, JoinColumn
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { UserPermission } from './user-permission.entity';
import { DocumentType } from '../../catalogs/document-types/entities/document-type.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    name: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    phone: string | null;

    // === NUEVO: relación con document_types ===
    @ManyToOne(() => DocumentType, { eager: true })
    @JoinColumn({ name: 'document_type_id' })
    documentType: DocumentType;

    @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
    documentNumber: string | null;

    @Column()
    passwordHash: string;

    @ManyToMany(() => Role, { eager: true })
    @JoinTable()
    roles: Role[];

    // renombramos el nombre de columna a snake_case
    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // ⬇️ para borrado lógico
    @DeleteDateColumn({ name: 'deleted_at', nullable: true })
    deletedAt?: Date | null;


    @OneToMany(() => UserPermission, (up) => up.user, { eager: true })
    overrides: UserPermission[];

}
