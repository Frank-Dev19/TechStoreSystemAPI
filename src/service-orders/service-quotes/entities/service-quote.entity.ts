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
import { ServiceOrderItem } from '../../entities/service-order-item.entity';
import { ServiceOrderDiagnosis } from '../../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderQuoteProduct } from './service-quote-product.entity';
import { ServiceOrderQuoteServiceItem } from './service-quote-service-item.entity';
import { ServiceOrderQuoteStatus } from '../service-quote-status.enum';

@Entity('service_order_quotes')
export class ServiceOrderQuote {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrderItem, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_item_id' })
  serviceOrderItem: ServiceOrderItem;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true })
  serviceOrderItemId: number;

  @ManyToOne(() => ServiceOrderDiagnosis, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'diagnosis_id' })
  diagnosis: ServiceOrderDiagnosis | null;

  @Column({ name: 'diagnosis_id', type: 'bigint', unsigned: true, nullable: true })
  diagnosisId: number | null;

  @Column({ name: 'sequence_number', type: 'int', unsigned: true, default: 1 })
  sequenceNumber: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ServiceOrderQuoteStatus,
    default: ServiceOrderQuoteStatus.CURRENT,
  })
  status: ServiceOrderQuoteStatus;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'sent_to_client_at', type: 'datetime', nullable: true })
  sentToClientAt: Date | null;

  @Column({ name: 'client_approved_at', type: 'datetime', nullable: true })
  clientApprovedAt: Date | null;

  @Column({ name: 'client_rejected_at', type: 'datetime', nullable: true })
  clientRejectedAt: Date | null;

  @Column({ name: 'client_notes', type: 'text', nullable: true })
  clientNotes: string | null;

  @OneToMany(() => ServiceOrderQuoteProduct, (product) => product.serviceOrderQuote, { cascade: true })
  productItems: ServiceOrderQuoteProduct[];

  @OneToMany(() => ServiceOrderQuoteServiceItem, (service) => service.serviceOrderQuote, { cascade: true })
  serviceItems: ServiceOrderQuoteServiceItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
