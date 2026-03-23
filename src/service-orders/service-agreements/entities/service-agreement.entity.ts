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
import { ServiceOrder } from '../../entities/service-order.entity';
import { ServiceOrderDiagnosis } from '../../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderAgreementProduct } from './service-agreement-product.entity';
import { ServiceOrderAgreementServiceItem } from './service-agreement-service-item.entity';
import { ServiceOrderAgreementStatus } from '../service-agreement-status.enum';
import { ServiceOrderAgreementSource } from '../service-agreement-source.enum';

@Entity('service_order_agreements')
export class ServiceOrderAgreement {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

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
    enum: ServiceOrderAgreementStatus,
    default: ServiceOrderAgreementStatus.DRAFT,
  })
  status: ServiceOrderAgreementStatus;

  @Column({
    name: 'source',
    type: 'enum',
    enum: ServiceOrderAgreementSource,
    default: ServiceOrderAgreementSource.TECHNICIAN_COORDINATION,
  })
  source: ServiceOrderAgreementSource;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'agreed_at', type: 'datetime', nullable: true })
  agreedAt: Date | null;

  @Column({ name: 'agreed_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  agreedByUserId: number | null;

  @OneToMany(() => ServiceOrderAgreementProduct, (product) => product.serviceOrderAgreement, { cascade: true })
  productItems: ServiceOrderAgreementProduct[];

  @OneToMany(() => ServiceOrderAgreementServiceItem, (service) => service.serviceOrderAgreement, { cascade: true })
  serviceItems: ServiceOrderAgreementServiceItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}


