import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('service_order_temp_documents')
export class ServiceOrderTempDocument {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 120, unique: true })
  token: string;

  @Column({ name: 'source_type', type: 'varchar', length: 60 })
  sourceType: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'absolute_path', type: 'varchar', length: 500 })
  absolutePath: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'metadata_json', type: 'longtext', nullable: true })
  metadataJson: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
