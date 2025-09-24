import { 
    Column, 
    CreateDateColumn, 
    Entity, 
    PrimaryGeneratedColumn, 
    UpdateDateColumn, 
    Index, 
    DeleteDateColumn 
} from "typeorm";

@Entity({ name: 'document_types' })
export class DocumentType {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true})
    id: number;

    @Index({ unique: true})
    @Column({ name: 'name', length: 50})
    name: string;

    @Column({ name: 'is_active', type: 'boolean'})
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at'})
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at'})
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at', nullable: true})
    deletedAt?: Date;
}
