import { Column, CreateDateColumn, Entity, OneToOne, PrimaryColumn } from 'typeorm';
import { Count } from './count.entity';

@Entity('count_differences_summary')
export class CountDifferenceSummary {
    @PrimaryColumn() countId: number;

    @OneToOne(() => Count, (c) => c.id, { onDelete: 'CASCADE' }) count: Count;

    @Column({ type: 'decimal', precision: 16, scale: 6, default: 0 }) surplusValue: number;
    @Column({ type: 'decimal', precision: 16, scale: 6, default: 0 }) shortageValue: number;
    @Column({ type: 'decimal', precision: 16, scale: 6, default: 0 }) netValue: number;

    @CreateDateColumn({ type: 'datetime' }) calculatedAt: Date;
    @Column({ length: 64 }) calculatedBy: string;
}
