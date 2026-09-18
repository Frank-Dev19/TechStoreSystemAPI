import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Sale } from '../../sales/entities/sale.entity';
import { PaymentMethod } from '../../sales/enums/payment-method.enum';
import { ElectronicDocumentStatus } from '../enums/electronic-document-status.enum';

@Entity({ name: 'electronic_credit_notes' })
@Index(['saleId', 'reasonCode'])
@Index(['companyId', 'series', 'number'], { unique: true })
export class ElectronicCreditNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sale_id' })
  saleId: number;

  @ManyToOne(() => Sale, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'series', type: 'varchar', length: 10 })
  series: string;

  @Column({ name: 'number', type: 'varchar', length: 15 })
  number: string;

  @Column({ name: 'reason_code', type: 'varchar', length: 4, default: '06' })
  reasonCode: string;

  @Column({ name: 'reason', type: 'varchar', length: 250 })
  reason: string;

  @Column({ name: 'observations', type: 'text', nullable: true })
  observations?: string | null;

  @Column({ name: 'refund_method', type: 'varchar', length: 20 })
  refundMethod: PaymentMethod;

  @Column({ name: 'amount', type: 'decimal', precision: 16, scale: 2 })
  amount: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: ElectronicDocumentStatus.PENDING,
  })
  status: ElectronicDocumentStatus;

  @Column({ name: 'payload_json', type: 'json', nullable: true })
  payloadJson?: unknown | null;

  @Column({ name: 'response_json', type: 'json', nullable: true })
  responseJson?: unknown | null;

  @Column({ name: 'xml', type: 'mediumtext', nullable: true })
  xml?: string | null;

  @Column({ name: 'cdr_zip', type: 'mediumtext', nullable: true })
  cdrZip?: string | null;

  @Column({ name: 'sunat_description', type: 'text', nullable: true })
  sunatDescription?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 100 })
  createdBy: string;

  @Column({ name: 'accepted_at', type: 'datetime', nullable: true })
  acceptedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
