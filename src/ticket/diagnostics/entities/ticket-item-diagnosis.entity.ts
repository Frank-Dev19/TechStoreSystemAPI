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
import { TicketItem } from '../../entities/ticket-item.entity';
import { TicketItemCycle } from '../../entities/ticket-item-cycle.entity';
import { DiagnosisStatus } from '../diagnosis-status.enum';

@Entity('ticket_item_diagnoses')
export class TicketItemDiagnosis {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => TicketItem, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_item_id' })
  ticketItem: TicketItem;

  @Column({ name: 'ticket_item_id', type: 'bigint', unsigned: true })
  ticketItemId: number;

  @ManyToOne(() => TicketItemCycle, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cycle_id' })
  cycle: TicketItemCycle | null;

  @Column({ name: 'cycle_id', type: 'bigint', unsigned: true, nullable: true })
  cycleId: number | null;

  @Column({ name: 'sequence_number', type: 'int', unsigned: true, default: 1 })
  sequenceNumber: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DiagnosisStatus,
    default: DiagnosisStatus.CURRENT,
  })
  status: DiagnosisStatus;

  @Column({ name: 'summary', type: 'varchar', length: 255 })
  summary: string;

  @Column({ name: 'details', type: 'text', nullable: true })
  details: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
