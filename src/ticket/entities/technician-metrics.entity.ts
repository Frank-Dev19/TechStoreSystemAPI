import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('technician_metrics')
export class TechnicianMetrics {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'technician_id', type: 'int', unique: true })
  technicianId: number;

  @Column({
    name: 'total_diagnosis_hours',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalDiagnosisHours: number;

  @Column({
    name: 'total_repair_hours',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalRepairHours: number;

  @Column({ name: 'diagnosis_count', type: 'int', unsigned: true, default: 0 })
  diagnosisCount: number;

  @Column({ name: 'repair_count', type: 'int', unsigned: true, default: 0 })
  repairCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
