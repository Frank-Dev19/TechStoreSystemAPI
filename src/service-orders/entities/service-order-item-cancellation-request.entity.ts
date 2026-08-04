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
import {
  ServiceOrderCancellationChannel,
  ServiceOrderCancellationResolution,
  ServiceOrderCancellationStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderItemCommercialVersion } from './service-order-item-commercial-version.entity';
import { ServiceOrderItem } from './service-order-item.entity';

@Entity('service_order_item_cancellation_requests')
@Index('IDX_service_order_item_cancellation_status', [
  'serviceOrderItemId',
  'status',
])
export class ServiceOrderItemCancellationRequest {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true })
  serviceOrderItemId: number;

  @ManyToOne(() => ServiceOrderItem, (item) => item.cancellationRequests, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_order_item_id' })
  serviceOrderItem: ServiceOrderItem;

  @Column({ type: 'enum', enum: ServiceOrderCancellationStatus })
  status: ServiceOrderCancellationStatus;

  @Column({
    type: 'enum',
    enum: ServiceOrderCancellationResolution,
    nullable: true,
  })
  resolution: ServiceOrderCancellationResolution | null;

  @Column({ type: 'enum', enum: ServiceOrderCancellationChannel })
  channel: ServiceOrderCancellationChannel;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'requested_by_user_id', type: 'int' })
  requestedByUserId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedByUser: User;

  @Column({ name: 'requested_at', type: 'datetime' })
  requestedAt: Date;

  @Column({
    name: 'previous_operative_status',
    type: 'enum',
    enum: ServiceOrderOperativeStatus,
  })
  previousOperativeStatus: ServiceOrderOperativeStatus;

  @Column({
    name: 'previous_technical_status',
    type: 'enum',
    enum: ServiceOrderTechnicalStatus,
  })
  previousTechnicalStatus: ServiceOrderTechnicalStatus;

  @Column({ name: 'resolved_by_user_id', type: 'int', nullable: true })
  resolvedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedByUser: User | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_reason', type: 'text', nullable: true })
  resolutionReason: string | null;

  @Column({
    name: 'charge_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  chargeAmount: number | null;

  @Column({
    name: 'commercial_version_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
  })
  commercialVersionId: number | null;

  @ManyToOne(() => ServiceOrderItemCommercialVersion, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'commercial_version_id' })
  commercialVersion: ServiceOrderItemCommercialVersion | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
