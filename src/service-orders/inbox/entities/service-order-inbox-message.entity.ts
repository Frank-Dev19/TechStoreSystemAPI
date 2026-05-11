import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrderInboxThread } from './service-order-inbox-thread.entity';
import {
  ServiceOrderInboxAuthorRole,
  ServiceOrderInboxDeliveryStatus,
  ServiceOrderInboxDirection,
} from '../service-order-inbox.types';
import { ServiceOrderInboxAttachment } from './service-order-inbox-attachment.entity';

@Entity('service_order_inbox_messages')
export class ServiceOrderInboxMessage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'thread_id', type: 'bigint', unsigned: true })
  threadId: number;

  @ManyToOne(() => ServiceOrderInboxThread, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread: ServiceOrderInboxThread;

  @Column({
    name: 'direction',
    type: 'enum',
    enum: ServiceOrderInboxDirection,
  })
  direction: ServiceOrderInboxDirection;

  @Column({
    name: 'author_role',
    type: 'enum',
    enum: ServiceOrderInboxAuthorRole,
  })
  authorRole: ServiceOrderInboxAuthorRole;

  @Column({ name: 'author_user_id', type: 'int', nullable: true })
  authorUserId: number | null;

  @Column({ name: 'author_display_name', type: 'varchar', length: 150, nullable: true })
  authorDisplayName: string | null;

  @Column({ name: 'text', type: 'text', nullable: true })
  text: string | null;

  @Column({
    name: 'delivery_status',
    type: 'enum',
    enum: ServiceOrderInboxDeliveryStatus,
    default: ServiceOrderInboxDeliveryStatus.QUEUED,
  })
  deliveryStatus: ServiceOrderInboxDeliveryStatus;

  @Column({ name: 'external_message_id', type: 'varchar', length: 180, nullable: true })
  externalMessageId: string | null;

  @Column({ name: 'provider_payload', type: 'text', nullable: true })
  providerPayload: string | null;

  @OneToMany(() => ServiceOrderInboxAttachment, (attachment) => attachment.message, {
    eager: false,
  })
  attachments?: ServiceOrderInboxAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
