import { 
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    DeleteDateColumn
} from 'typeorm';

export enum DocumentType {
    RUC = 'RUC',
    DNI = 'DNI'
}

@Entity({ name: 'suppliers' })
export class Supplier {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'business_name', length: 150})
    businessName: string;

    @Column({ name: 'trade_name', length: 150, nullable: true})
    tradeName?: string;

    @Column({ name: 'document_type', type: 'enum', enum: DocumentType})
    documentType: DocumentType;

    @Index({ unique: true})
    @Column({ name: 'document_number', length: 15})
    documentNumber: string;

    @Index({ unique: true, where: '"email" IS NOT NULL'})
    @Column({ name: 'email', length: 150, nullable: true})
    email?: string;

    @Column({ name: 'phone', length: 20, nullable: true})
    phone?: string;

    @Column({ name: 'address', length: 255, nullable: true})
    address?: string;

    @Column({ name: 'city', length: 150, nullable: true})
    city?: string;

    @Column({ name: 'country', length: 150, nullable: true})
    country?: string;

    @Column({ name: 'is_active', type: 'boolean', default: true})
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at'})
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at'})
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', nullable: true})
    deletedAt?: Date;
    
}
