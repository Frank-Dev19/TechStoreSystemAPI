import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrder } from '../../entities/service-order.entity';
import { ServiceOrderDiagnosisStatus } from '../service-order-diagnosis-status.enum';
import { ServiceOrderDiagnosisOutcome } from '../service-order-diagnosis-outcome.enum';

@Entity('service_order_diagnoses')
export class ServiceOrderDiagnosis {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

  @Column({ name: 'sequence_number', type: 'int', unsigned: true, default: 1 })
  sequenceNumber: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ServiceOrderDiagnosisStatus,
    default: ServiceOrderDiagnosisStatus.CURRENT,
  })
  status: ServiceOrderDiagnosisStatus;

  @Column({
    name: 'outcome',
    type: 'enum',
    enum: ServiceOrderDiagnosisOutcome,
    default: ServiceOrderDiagnosisOutcome.REPAIRABLE,
  })
  outcome: ServiceOrderDiagnosisOutcome;

  @Column({ name: 'summary', type: 'varchar', length: 255 })
  summary: string;

  @Column({ name: 'details', type: 'text', nullable: true })
  details: string | null;

  @Column({ name: 'outcome_reason', type: 'text', nullable: true })
  outcomeReason: string | null;

  @Column({ name: 'recommended_action', type: 'text', nullable: true })
  recommendedAction: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
