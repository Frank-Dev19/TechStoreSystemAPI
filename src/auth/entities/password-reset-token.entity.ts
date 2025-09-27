import {
    Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, RelationId, Index
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // Obtiene el userId sin crear otra columna
    @RelationId((t: PasswordResetToken) => t.user)
    userId: number;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 64 }) // sha256 hex
    tokenHash: string;

    // ⬇️ Cambiado a tipos compatibles con MySQL
    @Column({ type: 'datetime' })
    expiresAt: Date;

    @Column({ type: 'datetime', nullable: true })
    usedAt: Date | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    ip: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    userAgent: string;

    @CreateDateColumn({ type: 'datetime' })
    createdAt: Date;
}
