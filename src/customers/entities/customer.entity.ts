import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    JoinColumn,
    ManyToOne
} from 'typeorm';
import { DocumentType } from "../../catalogs/document-types/entities/document-type.entity";

@Entity({ name: 'customers' })
@Index('IDX_customers_deleted', ['deletedAt'])
@Index('UQ_customers_docnum_deleted', ['documentNumber', 'deletedAt'], { unique: true })
@Index('UQ_customers_email_deleted', ['email', 'deletedAt'], { unique: true })
export class Customer {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id: number;

    @Column({ name: 'name', length: 150})
    name: string;

    @Column({ name: 'document_type_id', type: 'bigint', unsigned: true })
    documentTypeId: number;
    
    @ManyToOne(() => DocumentType, {eager: false })
    @JoinColumn({ name: 'document_type_id' })
    documentType: DocumentType;

    @Column({ name: 'document_number', length: 15})
    documentNumber: string;

    @Column({ name: 'email', length: 150, nullable: true})
    email?: string;

    @Column({ name: 'phone', length: 20, nullable: true})
    phone?: string;

    @Column({ name: 'is_active', type: 'boolean', default: true})
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', nullable: true })
    deletedAt?: Date | null;
}

