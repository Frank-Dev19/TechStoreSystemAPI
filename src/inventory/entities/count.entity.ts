import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CountSnapshot } from './count-snapshot.entity';
import { CountEntry } from './count-entry.entity';

export type CountStatus = 'DRAFT' | 'FROZEN' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';

@Entity('counts')
@Unique(['code'])
export class Count {
    @PrimaryGeneratedColumn() id: number;
    @Column({ length: 32 }) code: string;     // ej. COUNT-YYYY-###
    @Column({ type: 'text', nullable: true }) description?: string | null;

    @Column({ length: 16, default: 'DRAFT' }) status: CountStatus;
    @Column({ length: 64 }) createdBy: string;
    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt: Date;
    @Column({ type: 'datetime', nullable: true }) frozenAt?: Date | null;
    @Column({ type: 'datetime', nullable: true }) postedAt?: Date | null;

    @OneToMany(() => CountSnapshot, (s) => s.count) snapshots: CountSnapshot[];
    @OneToMany(() => CountEntry, (e) => e.count) entries: CountEntry[];
}
