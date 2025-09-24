import { Column, CreateDateColumn, Entity, JoinTable, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "src/users/entities/user.entity";

@Entity('operation_keys')
export class OperationKey {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    action: string; // ejemplo: 'CHANGE_SELLER', 'DELETE_INVOICE'

    @Column()
    codeHash: string; // hash de la clave actual

    @Column({ default: true })
    isActive: boolean;

    @UpdateDateColumn()
    rotatedAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User, { eager: true })
    owner: User; // quién creó la clave (normalmente un admin)
}