// src/sales/entities/document-series.entity.ts
import {
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    Unique,
    Index,
} from 'typeorm';
import { DocumentType } from '../enums/document-type.enum';

@Entity({ name: 'document_series' })
@Index(['companyId', 'documentType', 'code'], { unique: true })
export class DocumentSeries {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id' })
    companyId: number;

    @Column({ name: 'document_type', length: 16 })
    documentType: DocumentType;

    @Column({ name: 'code', length: 10 })
    code: string;

    @Column({ name: 'name', length: 100 })
    name: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'current_number', default: 1 })
    currentNumber: number;

    @Column({ name: 'starting_number', default: 1 })
    startingNumber: number;

    @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
    createdBy?: string | null;

    @Column({ name: 'updated_by', type: 'varchar', length: 100, nullable: true })
    updatedBy?: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
    deletedAt?: Date | null;
}