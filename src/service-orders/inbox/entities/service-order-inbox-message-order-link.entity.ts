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
import { ServiceOrderInboxMessage } from './service-order-inbox-message.entity';

@Entity('service_order_inbox_message_order_links')
@Unique('UQ_service_order_inbox_message_order_link', ['messageId', 'serviceOrderId'])
export class ServiceOrderInboxMessageOrderLink {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'message_id', type: 'bigint', unsigned: true })
  messageId: number;

  @ManyToOne(() => ServiceOrderInboxMessage, (message) => message.orderLinks, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: ServiceOrderInboxMessage;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @CreateDateColumn({ name: 'linked_at' })
  linkedAt: Date;
}
