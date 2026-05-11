import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrderInboxMessage } from './service-order-inbox-message.entity';
import { ServiceOrderInboxAttachmentType } from '../service-order-inbox.types';

@Entity('service_order_inbox_attachments')
export class ServiceOrderInboxAttachment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'message_id', type: 'bigint', unsigned: true })
  messageId: number;

  @ManyToOne(() => ServiceOrderInboxMessage, (message) => message.attachments, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: ServiceOrderInboxMessage;

  @Column({
    name: 'attachment_type',
    type: 'enum',
    enum: ServiceOrderInboxAttachmentType,
  })
  attachmentType: ServiceOrderInboxAttachmentType;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 150 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint', unsigned: true, default: 0 })
  sizeBytes: number;

  @Column({ name: 'provider_media_id', type: 'varchar', length: 180, nullable: true })
  providerMediaId: string | null;

  @Column({ name: 'provider_url', type: 'text', nullable: true })
  providerUrl: string | null;

  @Column({ name: 'cached_file_path', type: 'varchar', length: 500, nullable: true })
  cachedFilePath: string | null;

  @Column({ name: 'public_url', type: 'varchar', length: 500, nullable: true })
  publicUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
