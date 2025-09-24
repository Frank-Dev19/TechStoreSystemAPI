import { Column, CreateDateColumn, Entity, JoinTable, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "src/users/entities/user.entity";


@Entity('audit_log')
export class AuditLog {
    @PrimaryGeneratedColumn('uuid') id: string;
    @ManyToOne(() => User) user: User;
    @Column() action: string;          // 'LOGIN_SUCCESS','USER_CREATE','DOC_CHANGE_DATE'...
    @Column() entity: string;          // 'USER','OS','DOCUMENT','PURCHASE','CASH','KEY'
    @Column() entityId: string;
    @Column({ type: 'json', nullable: true }) before: any;
    @Column({ type: 'json', nullable: true }) after: any;
    @Column({ nullable: true }) reason: string;
    @Column({ nullable: true }) keyId: string; // si se usó llave de operación p rey
    @Column({ nullable: true }) ip: string;
    @Column({ nullable: true }) userAgent: string;
    @CreateDateColumn() ts: Date;
}