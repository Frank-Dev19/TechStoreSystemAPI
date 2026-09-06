import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ServiceOrderDiagnosisOutcome } from '../../service-orders/diagnoses/service-order-diagnosis-outcome.enum';
import { ServiceOrderDiagnosis } from '../../service-orders/diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrder } from '../../service-orders/entities/service-order.entity';
import { WarrantyClaimStatus } from '../enums/warranty-claim-status.enum';
import { WarrantyCoverage } from './warranty-coverage.entity';

@Entity('warranty_claims')
@Index('IDX_warranty_claim_coverage_status', ['coverageId', 'status'])
export class WarrantyClaim {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'coverage_id', type: 'bigint', unsigned: true })
  coverageId: number;

  @ManyToOne(() => WarrantyCoverage, (coverage) => coverage.claims, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coverage_id' })
  coverage: WarrantyCoverage;

  @Column({ type: 'enum', enum: WarrantyClaimStatus, default: WarrantyClaimStatus.RECEIVED })
  status: WarrantyClaimStatus;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderId: number | null;

  @ManyToOne(() => ServiceOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder | null;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderItemId: number | null;

  @Column({ name: 'diagnosis_id', type: 'bigint', unsigned: true, nullable: true })
  diagnosisId: number | null;

  @ManyToOne(() => ServiceOrderDiagnosis, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'diagnosis_id' })
  diagnosis: ServiceOrderDiagnosis | null;

  @Column({ name: 'outcome', type: 'enum', enum: ServiceOrderDiagnosisOutcome, nullable: true })
  outcome: ServiceOrderDiagnosisOutcome | null;

  @Column({ name: 'origin_technician_id', type: 'int', nullable: true })
  originTechnicianId: number | null;

  @Column({ name: 'attending_technician_id', type: 'int', nullable: true })
  attendingTechnicianId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attending_technician_id' })
  attendingTechnician: User | null;

  @Column({ name: 'technician_override_reason', type: 'text', nullable: true })
  technicianOverrideReason: string | null;

  @Column({ name: 'reported_issue', type: 'text' })
  reportedIssue: string;

  @Column({ name: 'reserved_at', type: 'datetime' })
  reservedAt: Date;

  @Column({ name: 'review_started_at', type: 'datetime', nullable: true })
  reviewStartedAt: Date | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'int', nullable: true })
  cancelledBy: number | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
