import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ServiceOrder } from '../../entities/service-order.entity';
import { ServiceOrderInboxThread } from './service-order-inbox-thread.entity';

@Entity('service_order_inbox_thread_order_links')
@Unique('UQ_service_order_inbox_thread_order_link', ['threadId', 'serviceOrderId'])
export class ServiceOrderInboxThreadOrderLink {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'thread_id', type: 'bigint', unsigned: true })
  threadId: number;

  @ManyToOne(() => ServiceOrderInboxThread, (thread) => thread.orderLinks, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'thread_id' })
  thread: ServiceOrderInboxThread;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @CreateDateColumn({ name: 'linked_at' })
  linkedAt: Date;
}
