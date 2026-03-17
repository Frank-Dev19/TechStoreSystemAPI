import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { RequestOrigin, ServiceOrderPriority, ServiceOrderStatus } from '../enums';
import { ServiceOrderItem } from './service-order-item.entity';

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

  @Column({ name: 'estimated_delivery_date', type: 'datetime', nullable: true })
  estimatedDeliveryDate: Date | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'is_paid', type: 'boolean', default: false })
  isPaid: boolean;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'items_count', type: 'int', unsigned: true, default: 0 })
  itemsCount: number;

  @Column({ name: 'completed_items_count', type: 'int', unsigned: true, default: 0 })
  completedItemsCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => ServiceOrderItem, (item) => item.serviceOrder, { cascade: true })
  items: ServiceOrderItem[];

  pendingQuoteItemsCount?: number;
  rejectedQuoteItemsCount?: number;
  pendingDeliveryItemsCount?: number;
}
