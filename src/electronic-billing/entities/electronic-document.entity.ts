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
import { DocumentType } from '../../sales/enums/document-type.enum';
import { ElectronicDocumentStatus } from '../enums/electronic-document-status.enum';

@Entity({ name: 'electronic_documents' })
@Index(['saleId'])
@Index(['companyId', 'documentType', 'series', 'number'], { unique: true })
export class ElectronicDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sale_id' })
  saleId: number;

  @ManyToOne(() => Sale, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'provider', type: 'varchar', length: 30, default: 'APIS_PERU' })
  provider: string;

  @Column({ name: 'provider_endpoint', type: 'varchar', length: 120, nullable: true })
  providerEndpoint?: string | null;

  @Column({ name: 'document_type', type: 'varchar', length: 32 })
  documentType: DocumentType;

  @Column({ name: 'sunat_document_type_code', type: 'varchar', length: 4 })
  sunatDocumentTypeCode: string;

  @Column({ name: 'series', type: 'varchar', length: 10 })
  series: string;

  @Column({ name: 'number', type: 'varchar', length: 15 })
  number: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: ElectronicDocumentStatus.PENDING })
  status: ElectronicDocumentStatus;

  @Column({ name: 'payload_json', type: 'json', nullable: true })
  payloadJson?: unknown | null;

  @Column({ name: 'response_json', type: 'json', nullable: true })
  responseJson?: unknown | null;

  @Column({ name: 'xml', type: 'mediumtext', nullable: true })
  xml?: string | null;

  @Column({ name: 'hash', type: 'varchar', length: 255, nullable: true })
  hash?: string | null;

  @Column({ name: 'cdr_zip', type: 'mediumtext', nullable: true })
  cdrZip?: string | null;

  @Column({ name: 'sunat_code', type: 'varchar', length: 30, nullable: true })
  sunatCode?: string | null;

  @Column({ name: 'sunat_description', type: 'text', nullable: true })
  sunatDescription?: string | null;

  @Column({ name: 'sunat_notes', type: 'json', nullable: true })
  sunatNotes?: unknown | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt?: Date | null;

  @Column({ name: 'accepted_at', type: 'datetime', nullable: true })
  acceptedAt?: Date | null;

  @Column({ name: 'rejected_at', type: 'datetime', nullable: true })
  rejectedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
