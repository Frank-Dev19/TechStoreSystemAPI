import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TicketItemStatus } from '../enums';
import { TicketItem } from './ticket-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('ticket_item_events')
export class TicketItemEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => TicketItem, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_item_id' })
  ticketItem: TicketItem;

  @Column({ name: 'ticket_item_id', type: 'bigint', unsigned: true })
  ticketItemId: number;

  @Column({ name: 'from_status', type: 'enum', enum: TicketItemStatus })
  fromStatus: TicketItemStatus;

  @Column({ name: 'to_status', type: 'enum', enum: TicketItemStatus })
  toStatus: TicketItemStatus;

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
