import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentType } from '../../catalogs/document-types/entities/document-type.entity';

@Entity({ name: 'clients' })
@Index(['companyId', 'documentTypeId', 'documentNumber'], { unique: true })
export class Client {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'company_id', type: 'bigint', unsigned: true })
  companyId: number;

  @Column({ name: 'name', length: 150 })
  name: string;

  @Column({ name: 'trade_name', length: 150, nullable: true })
  tradeName?: string;

  @Column({ name: 'document_type_id', type: 'bigint', unsigned: true })
  documentTypeId: number;

  @ManyToOne(() => DocumentType, { eager: false, nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_type_id' })
  documentType: DocumentType;

  @Column({ name: 'document_number', length: 15 })
  documentNumber: string;

  @Column({ name: 'email', length: 150, nullable: true })
  email?: string;

  @Column({ name: 'phone', length: 20, nullable: true })
  phone?: string;

  @Column({ name: 'address', length: 255, nullable: true })
  address?: string;

  @Column({ name: 'ubigeo', type: 'varchar', length: 6, nullable: true })
  ubigeo?: string | null;

  @Column({ name: 'department', type: 'varchar', length: 120, nullable: true })
  department?: string | null;

  @Column({ name: 'province', type: 'varchar', length: 120, nullable: true })
  province?: string | null;

  @Column({ name: 'district', type: 'varchar', length: 120, nullable: true })
  district?: string | null;

  @Column({ name: 'urbanization', type: 'varchar', length: 150, nullable: true })
  urbanization?: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode?: string | null;

  @Column({ name: 'city', length: 150, nullable: true })
  city?: string;

  @Column({ name: 'country', length: 150, nullable: true })
  country?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;
}
