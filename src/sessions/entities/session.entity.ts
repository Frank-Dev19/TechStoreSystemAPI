import { CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Column } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('sessions')
export class Session {
    @PrimaryGeneratedColumn('uuid')
    id: string; // jti

    @ManyToOne(() => User, { eager: true })
    user: User;

    @Column()
    tokenHash: string; // hash del refresh

    @Column({ type: 'datetime' })
    expiresAt: Date;

    @Column({ type: 'datetime', nullable: true })
    revokedAt: Date | null;

    @Column({ type: 'datetime', nullable: true })
    rotatedAt: Date | null;

    @Column({ type: 'char', length: 36, nullable: true })
    rotatedFrom: string | null; // jti anterior

    @Column({ type: 'varchar', nullable: true })
    userAgent: string | null;

    @Column({ type: 'varchar', nullable: true })
    ip: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
