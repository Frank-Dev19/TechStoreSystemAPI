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
import { ServiceOrder } from './service-order.entity';

@Entity('service_order_notification_messages')
export class NotificationMessage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder | null;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderId: number | null;

  @Column({ name: 'channel', type: 'varchar', length: 30 })
  channel: string;

  @Column({ name: 'message_type', type: 'varchar', length: 80 })
  messageType: string;

  @Column({ name: 'recipient', type: 'varchar', length: 50, nullable: true })
  recipient: string | null;

  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180, unique: true })
  idempotencyKey: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @Column({ name: 'scope', type: 'varchar', length: 20, default: 'ORDER' })
  scope: string;

  @Column({ name: 'metadata_json', type: 'longtext', nullable: true })
  metadataJson: string | null;

  @Column({ name: 'attempt_count', type: 'int', unsigned: true, default: 0 })
  attemptCount: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
