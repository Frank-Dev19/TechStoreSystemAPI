import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessPartner } from '../../business-partner/entities/business-partner.entity';
import { User } from '../../users/entities/user.entity';
import { TicketStatus, TicketPriority, PaymentStatus } from '../enums';
import { TicketItem } from './ticket-item.entity';

@Entity('tickets')
export class Ticket {
  // ==================== IDENTIFICACIÓN ====================
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code: string; // STYYYYMMDDHHmm#### (ej. ST2025122216240001)

  // ==================== ESTADOS Y PRIORIDAD ====================
  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enum: TicketPriority,
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  // ==================== RELACIONES CON PERSONAS ====================
  @ManyToOne(() => BusinessPartner, { eager: false, nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_partner_id' })
  businessPartner: BusinessPartner;

  @Column({ name: 'business_partner_id', type: 'bigint', unsigned: true })
  businessPartnerId: number;

  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closed_by' })
  closer: User | null;

  @Column({ name: 'closed_by', type: 'int', nullable: true })
  closedBy: number | null;

  // ==================== INFORMACIÓN DE CONTACTO (OPCIONAL) ====================
  @Column({ name: 'contact_name', type: 'varchar', length: 150, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 150, nullable: true })
  contactEmail: string | null;

  // ================================= FECHAS ====================================
  @Column({ name: 'estimated_delivery_date', type: 'datetime', nullable: true })
  estimatedDeliveryDate: Date | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  // ======================== INFORMACIÓN FINANCIERA ==============================
  @Column({
    name: 'total_quoted_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalQuotedAmount: number;

  @Column({
    name: 'total_paid_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalPaidAmount: number;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'PEN' })
  currency: string;

  // ==================== NOTAS ====================
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  // ==================== METADATOS ====================
  @Column({ name: 'items_count', type: 'int', unsigned: true, default: 0 })
  itemsCount: number;

  @Column({ name: 'completed_items_count', type: 'int', unsigned: true, default: 0 })
  completedItemsCount: number;

  // ==================== AUDITORÍA ====================
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  // ==================== RELACIONES ====================
  @OneToMany(() => TicketItem, (item) => item.ticket, { cascade: true })
  items: TicketItem[];
}
