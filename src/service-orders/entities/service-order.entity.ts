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
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import {
  EquipmentType,
  RequestOrigin,
  ServiceOrderPaymentStatus,
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderWorkflowStatus,
  ServiceType,
} from '../enums';

@Entity('service_orders')
export class ServiceOrder {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({
    type: 'enum',
    enum: ServiceOrderStatus,
    default: ServiceOrderStatus.OPEN,
  })
  status: ServiceOrderStatus;

  @Column({
    name: 'workflow_status',
    type: 'enum',
    enum: ServiceOrderWorkflowStatus,
    default: ServiceOrderWorkflowStatus.ASSIGNED,
  })
  workflowStatus: ServiceOrderWorkflowStatus;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: ServiceOrderPaymentStatus,
    default: ServiceOrderPaymentStatus.UNPAID,
  })
  paymentStatus: ServiceOrderPaymentStatus;

  @Column({
    type: 'enum',
    enum: ServiceOrderPriority,
    default: ServiceOrderPriority.MEDIUM,
  })
  priority: ServiceOrderPriority;

  @Column({
    name: 'request_origin',
    type: 'enum',
    enum: RequestOrigin,
    default: RequestOrigin.CLIENT,
  })
  requestOrigin: RequestOrigin;

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

  @Column({ name: 'accessories', type: 'text', nullable: true })
  accessories: string | null;

  @Column({ name: 'service_type', type: 'enum', enum: ServiceType, default: ServiceType.DIAGNOSIS })
  serviceType: ServiceType;

  @Column({ name: 'initial_issue', type: 'text' })
  initialIssue: string;

  @Column({
    name: 'estimated_repair_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  estimatedRepairHours: number | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assigned_to_technician_id' })
  assignedTechnician: User | null;

  @Column({ name: 'assigned_to_technician_id', type: 'int', nullable: true })
  assignedToTechnicianId: number | null;

  @Column({ name: 'assigned_at', type: 'datetime', nullable: true })
  assignedAt: Date | null;

  @ManyToOne(() => Client, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @Column({ name: 'client_id', type: 'bigint', unsigned: true, nullable: true })
  clientId: number | null;

  @Column({ name: 'client_snapshot_name', type: 'varchar', length: 150, nullable: true })
  clientSnapshotName: string | null;

  @Column({ name: 'client_snapshot_document_type_name', type: 'varchar', length: 100, nullable: true })
  clientSnapshotDocumentTypeName: string | null;

  @Column({ name: 'client_snapshot_document_number', type: 'varchar', length: 20, nullable: true })
  clientSnapshotDocumentNumber: string | null;

  @Column({ name: 'client_snapshot_phone', type: 'varchar', length: 20, nullable: true })
  clientSnapshotPhone: string | null;

  @Column({ name: 'client_snapshot_email', type: 'varchar', length: 150, nullable: true })
  clientSnapshotEmail: string | null;

  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closed_by' })
  closer: User | null;

  @Column({ name: 'closed_by', type: 'int', nullable: true })
  closedBy: number | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelled_by' })
  canceller: User | null;

  @Column({ name: 'cancelled_by', type: 'int', nullable: true })
  cancelledBy: number | null;

  @Column({ name: 'estimated_delivery_date', type: 'datetime', nullable: true })
  estimatedDeliveryDate: Date | null;

  @Column({ name: 'received_at', type: 'datetime' })
  receivedAt: Date;

  @Column({ name: 'review_started_at', type: 'datetime', nullable: true })
  reviewStartedAt: Date | null;

  @Column({ name: 'service_started_at', type: 'datetime', nullable: true })
  serviceStartedAt: Date | null;

  @Column({ name: 'service_completed_at', type: 'datetime', nullable: true })
  serviceCompletedAt: Date | null;

  @Column({ name: 'ready_for_pickup_at', type: 'datetime', nullable: true })
  readyForPickupAt: Date | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'delivered_at', type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'is_paid', type: 'boolean', default: false })
  isPaid: boolean;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'discount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

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
