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
import { ServiceOrderQuote } from './service-quote.entity';
import { Service } from '../../../service-catalog/entities/service.entity';

@Entity('service_order_quote_services')
export class ServiceOrderQuoteServiceItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrderQuote, (quote) => quote.serviceItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_quote_id' })
  serviceOrderQuote: ServiceOrderQuote;

  @Column({ name: 'service_order_quote_id', type: 'bigint', unsigned: true })
  serviceOrderQuoteId: number;

  @ManyToOne(() => Service, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'service_id' })
  service: Service | null;

  @Column({ name: 'service_id', type: 'int', unsigned: true, nullable: true })
  serviceId: number | null;

  @Column({ name: 'service_code_snapshot', type: 'varchar', length: 50 })
  serviceCodeSnapshot: string;

  @Column({ name: 'service_name_snapshot', type: 'varchar', length: 150 })
  serviceNameSnapshot: string;

  @Column({ name: 'service_description_snapshot', type: 'text', nullable: true })
  serviceDescriptionSnapshot: string | null;

  @Column({ name: 'estimated_hours', type: 'decimal', precision: 5, scale: 2, default: 1 })
  estimatedHours: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 10, scale: 2 })
  lineTotal: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
