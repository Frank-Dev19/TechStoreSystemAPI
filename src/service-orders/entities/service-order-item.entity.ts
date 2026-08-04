import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  EquipmentType,
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrderItemCommercialVersion } from './service-order-item-commercial-version.entity';
import { ServiceOrderItemCancellationRequest } from './service-order-item-cancellation-request.entity';

@Entity('service_order_items')
@Unique('UQ_service_order_item_position', ['serviceOrderId', 'position'])
export class ServiceOrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

  @ManyToOne(() => ServiceOrder, (order) => order.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ type: 'tinyint', unsigned: true })
  position: number;

  @Column({ type: 'varchar', length: 54, unique: true })
  code: string;

  @Column({ name: 'equipment_type', type: 'enum', enum: EquipmentType })
  equipmentType: EquipmentType;

  @Column({ name: 'equipment_type_other', type: 'varchar', length: 120, nullable: true })
  equipmentTypeOther: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  model: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber: string | null;

  @Index('IDX_service_order_item_serial_normalized')
  @Column({ name: 'serial_number_normalized', type: 'varchar', length: 100, nullable: true })
  serialNumberNormalized: string | null;

  @Column({ type: 'text', nullable: true })
  accessories: string | null;

  @Column({ name: 'initial_issue', type: 'text' })
  initialIssue: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: ServiceOrderPriority, default: ServiceOrderPriority.LOW })
  priority: ServiceOrderPriority;

  @Column({ name: 'operative_status', type: 'enum', enum: ServiceOrderOperativeStatus })
  operativeStatus: ServiceOrderOperativeStatus;

  @Column({ name: 'technical_status', type: 'enum', enum: ServiceOrderTechnicalStatus })
  technicalStatus: ServiceOrderTechnicalStatus;

  @Column({ name: 'commercial_status', type: 'enum', enum: ServiceOrderCommercialStatus })
  commercialStatus: ServiceOrderCommercialStatus;

  @Column({ name: 'estimated_repair_hours', type: 'decimal', precision: 5, scale: 2, nullable: true })
  estimatedRepairHours: number | null;

  @Column({ name: 'estimated_delivery_date', type: 'datetime', nullable: true })
  estimatedDeliveryDate: Date | null;

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

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'warranty_source_item_id', type: 'bigint', unsigned: true, nullable: true })
  warrantySourceItemId: number | null;

  @ManyToOne(() => ServiceOrderItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warranty_source_item_id' })
  warrantySourceItem: ServiceOrderItem | null;

  @OneToMany(() => ServiceOrderItemCommercialVersion, (version) => version.serviceOrderItem)
  commercialVersions: ServiceOrderItemCommercialVersion[];

  @OneToMany(() => ServiceOrderItemCancellationRequest, (request) => request.serviceOrderItem)
  cancellationRequests?: ServiceOrderItemCancellationRequest[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
