import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceOrderItemStatus } from '../enums';
import { ServiceOrderItem } from './service-order-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('service_order_item_events')
export class ServiceOrderItemEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrderItem, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_item_id' })
  serviceOrderItem: ServiceOrderItem;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true })
  serviceOrderItemId: number;

  @Column({ name: 'from_status', type: 'enum', enum: ServiceOrderItemStatus })
  fromStatus: ServiceOrderItemStatus;

  @Column({ name: 'to_status', type: 'enum', enum: ServiceOrderItemStatus })
  toStatus: ServiceOrderItemStatus;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
