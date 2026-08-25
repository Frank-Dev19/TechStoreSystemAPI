import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrder } from '../entities/service-order.entity';

@Entity('service_order_surveys')
export class ServiceOrderSurvey {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrder, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true, unique: true })
  serviceOrderId: number;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({ name: 'submitted_at', type: 'datetime', precision: 6, nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'overall_rating', type: 'tinyint', unsigned: true, nullable: true })
  overallRating: number | null;

  @Column({ name: 'attention_rating', type: 'tinyint', unsigned: true, nullable: true })
  attentionRating: number | null;

  @Column({ name: 'service_quality_rating', type: 'tinyint', unsigned: true, nullable: true })
  serviceQualityRating: number | null;

  @Column({ name: 'comment', type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
