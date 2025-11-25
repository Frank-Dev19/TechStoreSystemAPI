import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TicketItem } from '../../entities/ticket-item.entity';
import { TicketItemDiagnosis } from '../../diagnostics/entities/ticket-item-diagnosis.entity';
import { QuoteProduct } from './quote-product.entity';
import { QuoteServiceItem } from './quote-service-item.entity';
import { QuoteStatus } from '../quote-status.enum';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => TicketItem, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_item_id' })
  ticketItem: TicketItem | null;

  @Column({ name: 'ticket_item_id', type: 'bigint', unsigned: true, nullable: true })
  ticketItemId: number | null;

  @ManyToOne(() => TicketItemDiagnosis, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'diagnosis_id' })
  diagnosis: TicketItemDiagnosis | null;

  @Column({ name: 'diagnosis_id', type: 'bigint', unsigned: true, nullable: true })
  diagnosisId: number | null;

  @Column({ name: 'sequence_number', type: 'int', unsigned: true, default: 1 })
  sequenceNumber: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: QuoteStatus,
    default: QuoteStatus.CURRENT,
  })
  status: QuoteStatus;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'PEN' })
  currency: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => QuoteProduct, (product) => product.quote, { cascade: true })
  productItems: QuoteProduct[];

  @OneToMany(() => QuoteServiceItem, (service) => service.quote, { cascade: true })
  serviceItems: QuoteServiceItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
