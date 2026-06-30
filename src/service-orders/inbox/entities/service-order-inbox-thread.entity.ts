import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ServiceOrderInboxAuthorRole,
  ServiceOrderInboxDirection,
} from '../service-order-inbox.types';
import { ServiceOrderInboxMessage } from './service-order-inbox-message.entity';
import { ServiceOrderInboxThreadOrderLink } from './service-order-inbox-thread-order-link.entity';

@Entity('service_order_inbox_threads')
export class ServiceOrderInboxThread {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'client_id', type: 'bigint', unsigned: true, nullable: true })
  clientId: number | null;

  @Column({ name: 'client_phone_snapshot', type: 'varchar', length: 50, nullable: true, unique: true })
  clientPhoneSnapshot: string | null;

  @Column({ name: 'client_display_name_snapshot', type: 'varchar', length: 150, nullable: true })
  clientDisplayNameSnapshot: string | null;

  @Column({ name: 'external_thread_key', type: 'varchar', length: 180, unique: true })
  externalThreadKey: string;

  @Column({ name: 'last_message_text', type: 'text', nullable: true })
  lastMessageText: string | null;

  @Column({ name: 'last_message_at', type: 'datetime', nullable: true })
  lastMessageAt: Date | null;

  @Column({ name: 'last_customer_message_at', type: 'datetime', nullable: true })
  lastCustomerMessageAt: Date | null;

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

  @OneToMany(() => ServiceOrderInboxMessage, (message) => message.thread, {
    eager: false,
  })
  messages?: ServiceOrderInboxMessage[];

  @OneToMany(() => ServiceOrderInboxThreadOrderLink, (link) => link.thread, {
    eager: false,
  })
  orderLinks?: ServiceOrderInboxThreadOrderLink[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
