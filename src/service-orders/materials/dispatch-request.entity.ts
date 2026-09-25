import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DispatchRequestStatus, DispatchRequestType } from './dispatch-request.policy';

@Entity('dispatch_requests')
@Index('IDX_dispatch_request_queue', ['type', 'status', 'createdAt'])
@Index('UQ_dispatch_request_warranty_claim', ['warrantyClaimId'], {
  unique: true,
  where: '`warranty_claim_id` IS NOT NULL',
})
export class DispatchRequest {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: number;
  @Column({ type: 'enum', enum: DispatchRequestType }) type: DispatchRequestType;
  @Column({ type: 'enum', enum: DispatchRequestStatus, default: DispatchRequestStatus.PENDING })
  status: DispatchRequestStatus;
  @Column({ name: 'technician_id', type: 'int' }) technicianId: number;
  @Column({ name: 'requested_by', type: 'int' }) requestedBy: number;
  @Column({ name: 'product_id', type: 'int' }) productId: number;
  @Column({ type: 'decimal', precision: 14, scale: 4 }) quantity: number;
  @Column({ type: 'text' }) reason: string;
  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderId: number | null;
  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderItemId: number | null;
  @Column({ name: 'warranty_claim_id', type: 'bigint', unsigned: true, nullable: true })
  warrantyClaimId: number | null;
  @Column({ name: 'original_serial_id', type: 'int', nullable: true }) originalSerialId: number | null;
  @Column({ name: 'original_unit_condition', type: 'varchar', length: 20, nullable: true })
  originalUnitCondition: 'UNDER_REVIEW' | 'UNUSABLE' | null;
  @Column({ name: 'delivery_id', type: 'int', nullable: true }) deliveryId: number | null;
  @Column({ name: 'resolved_by', type: 'int', nullable: true }) resolvedBy: number | null;
  @Column({ name: 'resolution_note', type: 'text', nullable: true }) resolutionNote: string | null;
  @Column({ name: 'delivered_at', type: 'datetime', nullable: true }) deliveredAt: Date | null;
  @Column({ name: 'confirmed_at', type: 'datetime', nullable: true }) confirmedAt: Date | null;
  @Column({ name: 'rejected_at', type: 'datetime', nullable: true }) rejectedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
