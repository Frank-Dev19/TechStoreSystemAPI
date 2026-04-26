import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrder } from '../../entities/service-order.entity';
import {
  ServiceOrderInboxAuthorRole,
  ServiceOrderInboxDirection,
} from '../service-order-inbox.types';

@Entity('service_order_inbox_threads')
export class ServiceOrderInboxThread {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true, unique: true })
  serviceOrderId: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ name: 'client_phone_snapshot', type: 'varchar', length: 50, nullable: true })
  clientPhoneSnapshot: string | null;

  @Column({ name: 'external_thread_key', type: 'varchar', length: 180, unique: true })
  externalThreadKey: string;

  @Column({ name: 'last_message_text', type: 'text', nullable: true })
  lastMessageText: string | null;

  @Column({ name: 'last_message_at', type: 'datetime', nullable: true })
  lastMessageAt: Date | null;

  @Column({
    name: 'last_message_direction',
    type: 'enum',
    enum: ServiceOrderInboxDirection,
    nullable: true,
  })
  lastMessageDirection: ServiceOrderInboxDirection | null;

  @Column({
    name: 'last_message_author_role',
    type: 'enum',
    enum: ServiceOrderInboxAuthorRole,
    nullable: true,
  })
  lastMessageAuthorRole: ServiceOrderInboxAuthorRole | null;

  @Column({ name: 'unread_for_reception', type: 'int', unsigned: true, default: 0 })
  unreadForReception: number;

  @Column({ name: 'unread_for_technician', type: 'int', unsigned: true, default: 0 })
  unreadForTechnician: number;

  @Column({ name: 'unread_for_supervisor', type: 'int', unsigned: true, default: 0 })
  unreadForSupervisor: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
