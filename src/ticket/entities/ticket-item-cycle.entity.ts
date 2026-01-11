import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TicketItem } from './ticket-item.entity';
import { TicketItemCyclePhase } from '../enums';
import { User } from '../../users/entities/user.entity';

@Entity('ticket_item_cycles')
export class TicketItemCycle {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => TicketItem, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_item_id' })
  ticketItem: TicketItem;

  @Column({ name: 'ticket_item_id', type: 'bigint', unsigned: true })
  ticketItemId: number;

  @Column({
    name: 'phase',
    type: 'enum',
    enum: TicketItemCyclePhase,
  })
  phase: TicketItemCyclePhase;

  @Column({ name: 'sequence_number', type: 'int', unsigned: true, default: 1 })
  sequenceNumber: number;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'technician_id' })
  technician: User | null;

  @Column({ name: 'technician_id', type: 'int', nullable: true })
  technicianId: number | null;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
