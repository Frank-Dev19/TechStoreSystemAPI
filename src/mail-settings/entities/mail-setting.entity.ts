import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MailEncryption } from '../enums/mail-encryption.enum';
import { MailPurpose } from '../enums/mail-purpose.enum';

@Entity({ name: 'mail_settings' })
export class MailSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  purpose: MailPurpose;

  @Column({ type: 'varchar', length: 180 })
  host: string;

  @Column({ type: 'int' })
  port: number;

  @Column({ type: 'varchar', length: 20, default: MailEncryption.STARTTLS })
  encryption: MailEncryption;

  @Column({ type: 'varchar', length: 180 })
  username: string;

  @Column({ name: 'password_encrypted', type: 'text', nullable: true, select: false })
  passwordEncrypted?: string | null;

  @Column({ name: 'from_name', type: 'varchar', length: 120 })
  fromName: string;

  @Column({ name: 'from_email', type: 'varchar', length: 180 })
  fromEmail: string;

  @Column({ name: 'reply_to', type: 'varchar', length: 180, nullable: true })
  replyTo?: string | null;

  @Column({ name: 'subject_template', type: 'varchar', length: 180, nullable: true })
  subjectTemplate?: string | null;

  @Column({ name: 'intro_text', type: 'text', nullable: true })
  introText?: string | null;

  @Column({ name: 'footer_text', type: 'text', nullable: true })
  footerText?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_tested_at', type: 'datetime', nullable: true })
  lastTestedAt?: Date | null;

  @Column({ name: 'last_test_successful', type: 'boolean', nullable: true })
  lastTestSuccessful?: boolean | null;

  @Column({ name: 'last_test_message', type: 'varchar', length: 500, nullable: true })
  lastTestMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}

