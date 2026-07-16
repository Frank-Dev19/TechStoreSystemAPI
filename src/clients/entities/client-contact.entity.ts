import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

@Entity({ name: 'client_contacts' })
export class ClientContact {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'client_id', type: 'bigint', unsigned: true })
  clientId: number;

  @ManyToOne(() => Client, (client) => client.contacts, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'email', type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'is_primary', type: 'tinyint', default: false })
  isPrimary: boolean;

  @Column({ name: 'is_active', type: 'tinyint', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
