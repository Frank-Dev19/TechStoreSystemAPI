import {
  AfterLoad,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrder } from './service-order.entity';
import { User } from '../../users/entities/user.entity';
import { EquipmentType, ServiceOrderItemStatus, ServiceType } from '../enums';

@Entity('service_order_items')
export class ServiceOrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

  @Column({ name: 'item_number', type: 'int', unsigned: true })
  itemNumber: number;

  @Column({ name: 'equipment_type', type: 'enum', enum: EquipmentType })
  equipmentType: EquipmentType;

  @Column({ name: 'equipment_type_other', type: 'varchar', length: 120, nullable: true })
  equipmentTypeOther: string | null;

  @Column({ name: 'brand', type: 'varchar', length: 100, nullable: true })
  brand: string | null;

  @Column({ name: 'model', type: 'varchar', length: 150, nullable: true })
  model: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber: string | null;

  @Column({ name: 'initial_issue', type: 'text' })
  initialIssue: string;

  @Column({ name: 'accessories', type: 'text', nullable: true })
  accessories: string | null;

  @Column({ name: 'service_type', type: 'enum', enum: ServiceType, default: ServiceType.DIAGNOSIS })
  serviceType: ServiceType;

  @Column({
    type: 'enum',
    enum: ServiceOrderItemStatus,
    default: ServiceOrderItemStatus.ASSIGNED,
  })
  status: ServiceOrderItemStatus;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assigned_to_technician_id' })
  assignedTechnician: User | null;

  @Column({ name: 'assigned_to_technician_id', type: 'int', nullable: true })
  assignedToTechnicianId: number | null;

  @Column({ name: 'assigned_at', type: 'datetime', nullable: true })
  assignedAt: Date | null;

  @Column({
    name: 'estimated_repair_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  estimatedRepairHours: number | null;

  @Column({ name: 'received_at', type: 'datetime' })
  receivedAt: Date;

  @Column({ name: 'diagnosis_started_at', type: 'datetime', nullable: true })
  diagnosisStartedAt: Date | null;

  @Column({ name: 'diagnosis_completed_at', type: 'datetime', nullable: true })
  diagnosisCompletedAt: Date | null;

  @Column({ name: 'quoted_at', type: 'datetime', nullable: true })
  quotedAt: Date | null;

  @Column({ name: 'quote_sent_at', type: 'datetime', nullable: true })
  quoteSentAt: Date | null;

  @Column({ name: 'quote_approved_at', type: 'datetime', nullable: true })
  quoteApprovedAt: Date | null;

  @Column({ name: 'quote_rejected_at', type: 'datetime', nullable: true })
  quoteRejectedAt: Date | null;

  @Column({ name: 'last_customer_response_at', type: 'datetime', nullable: true })
  lastCustomerResponseAt: Date | null;

  @Column({ name: 'repair_started_at', type: 'datetime', nullable: true })
  repairStartedAt: Date | null;

  @Column({ name: 'repair_completed_at', type: 'datetime', nullable: true })
  repairCompletedAt: Date | null;

  @Column({ name: 'delivered_at', type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'discount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelled_by' })
  canceller: User | null;

  @Column({ name: 'cancelled_by', type: 'int', nullable: true })
  cancelledBy: number | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'rating', type: 'tinyint', unsigned: true, nullable: true })
  rating: number | null;

  @Column({ name: 'rating_comment', type: 'text', nullable: true })
  ratingComment: string | null;

  @Column({ name: 'rated_at', type: 'datetime', nullable: true })
  ratedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  assignedToTechnicianName?: string | null;

  @AfterLoad()
  populateVirtualFields(): void {
    this.assignedToTechnicianName = this.assignedTechnician?.name ?? null;
  }
}
