import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NotificationMessage } from './notification-message.entity';

@Entity('service_order_notification_delivery_attempts')
export class NotificationDeliveryAttempt {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => NotificationMessage, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_message_id' })
  notificationMessage: NotificationMessage;

  @Column({ name: 'notification_message_id', type: 'bigint', unsigned: true })
  notificationMessageId: number;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'response_payload', type: 'text', nullable: true })
  responsePayload: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
