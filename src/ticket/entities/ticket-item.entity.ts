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
import { Ticket } from './ticket.entity';
import { User } from '../../users/entities/user.entity';
import {
  TicketItemStatus,
  ServiceLocation,
  ClientSLAPauseReason,
  EquipmentType,
} from '../enums';

@Entity('ticket_items')
export class TicketItem {
  // ==================== IDENTIFICACIÓN ====================
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => Ticket, { eager: false, nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @Column({ name: 'ticket_id', type: 'bigint', unsigned: true })
  ticketId: number;

  @Column({ name: 'item_number', type: 'int', unsigned: true })
  itemNumber: number;

  // ==================== INFORMACIÓN DEL EQUIPO ====================
  @Column({ name: 'equipment_type', type: 'enum', enum: EquipmentType })
  equipmentType: EquipmentType;

  @Column({ name: 'brand', type: 'varchar', length: 100, nullable: true })
  brand: string | null;

  @Column({ name: 'model', type: 'varchar', length: 150, nullable: true })
  model: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber: string | null;

  @Column({ name: 'initial_issue', type: 'text' })
  initialIssue: string;

  @Column({ name: 'accessories', type: 'text', nullable: true })
  accessories: string | null;

  @Column({ name: 'requires_diagnosis', type: 'boolean', default: true })
  requiresDiagnosis: boolean;

  // ==================== ESTADO ====================
  @Column({
    type: 'enum',
    enum: TicketItemStatus,
    default: TicketItemStatus.RECEIVED,
  })
  status: TicketItemStatus;

  // ==================== ASIGNACIÓN ====================
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assigned_to_technician_id' })
  assignedTechnician: User | null;

  @Column({ name: 'assigned_to_technician_id', type: 'int', nullable: true })
  assignedToTechnicianId: number | null;

  @Column({ name: 'assigned_at', type: 'datetime', nullable: true })
  assignedAt: Date | null;

  // ==================== UBICACIÓN DEL SERVICIO ====================
  @Column({
    name: 'service_location',
    type: 'enum',
    enum: ServiceLocation,
    default: ServiceLocation.ON_SITE,
  })
  serviceLocation: ServiceLocation;

  @Column({ name: 'service_address', type: 'text', nullable: true })
  serviceAddress: string | null;

  @Column({ name: 'service_address_reference', type: 'varchar', length: 255, nullable: true })
  serviceAddressReference: string | null;

  @Column({ name: 'scheduled_service_date', type: 'datetime', nullable: true })
  scheduledServiceDate: Date | null;

  // ==================== SLA DEL CLIENTE (EXTERNO) ====================
  @Column({ name: 'sla_target_days', type: 'int', unsigned: true, default: 5 })
  slaTargetDays: number;

  @Column({ name: 'sla_start_date', type: 'datetime', nullable: true })
  slaStartDate: Date | null;

  @Column({ name: 'sla_deadline', type: 'datetime', nullable: true })
  slaDeadline: Date | null;

  @Column({ name: 'sla_paused', type: 'boolean', default: false })
  slaPaused: boolean;

  @Column({ name: 'sla_paused_at', type: 'datetime', nullable: true })
  slaPausedAt: Date | null;

  @Column({
    name: 'sla_paused_reason',
    type: 'enum',
    enum: ClientSLAPauseReason,
    nullable: true,
  })
  slaPausedReason: ClientSLAPauseReason | null;

  @Column({ name: 'sla_paused_days', type: 'int', unsigned: true, default: 0 })
  slaPausedDays: number;

  @Column({ name: 'sla_breached', type: 'boolean', default: false })
  slaBreached: boolean;

  @Column({ name: 'sla_breached_at', type: 'datetime', nullable: true })
  slaBreachedAt: Date | null;

  // ==================== KPIs INTERNOS DEL TÉCNICO ====================
  // Nota: Estos valores se calculan automáticamente cuando cambian los status
  // y se almacenan para mejor performance en queries

  @Column({
    name: 'estimated_repair_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  estimatedRepairHours: number | null; // Suma de duración de servicios en la cotización

  @Column({
    name: 'actual_diagnosis_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  actualDiagnosisHours: number | null; // Calculado: business hours entre diagnosisStartedAt y diagnosisCompletedAt

  @Column({
    name: 'actual_repair_hours',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  actualRepairHours: number | null; // Calculado: business hours entre repairStartedAt y repairCompletedAt

  @Column({
    name: 'diagnosis_efficiency_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  diagnosisEfficiencyPercent: number | null; // Para futuro uso si se implementan estimados de diagnóstico

  @Column({
    name: 'repair_efficiency_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  repairEfficiencyPercent: number | null; // Calculado: (estimatedRepairHours / actualRepairHours) * 100

  // ==================== REPUESTOS ====================
  @Column({ name: 'requires_parts', type: 'boolean', default: false })
  requiresParts: boolean;

  @Column({ name: 'parts_requested_at', type: 'datetime', nullable: true })
  partsRequestedAt: Date | null;

  @Column({ name: 'parts_received_at', type: 'datetime', nullable: true })
  partsReceivedAt: Date | null;

  // ==================== FECHAS DE TRACKING ====================
  @Column({ name: 'received_at', type: 'datetime' })
  receivedAt: Date;

  @Column({ name: 'diagnosis_started_at', type: 'datetime', nullable: true })
  diagnosisStartedAt: Date | null;

  @Column({ name: 'diagnosis_completed_at', type: 'datetime', nullable: true })
  diagnosisCompletedAt: Date | null;

  @Column({ name: 'quoted_at', type: 'datetime', nullable: true })
  quotedAt: Date | null;

  @Column({ name: 'quote_sent_at', type: 'datetime', nullable: true })
  quoteSentAt: Date | null;

  @Column({ name: 'quote_approved_at', type: 'datetime', nullable: true })
  quoteApprovedAt: Date | null;

  @Column({ name: 'quote_rejected_at', type: 'datetime', nullable: true })
  quoteRejectedAt: Date | null;

  @Column({ name: 'last_customer_response_at', type: 'datetime', nullable: true })
  lastCustomerResponseAt: Date | null;

  @Column({ name: 'repair_started_at', type: 'datetime', nullable: true })
  repairStartedAt: Date | null;

  @Column({ name: 'repair_completed_at', type: 'datetime', nullable: true })
  repairCompletedAt: Date | null;

  @Column({ name: 'ready_for_delivery_at', type: 'datetime', nullable: true })
  readyForDeliveryAt: Date | null;

  @Column({ name: 'delivered_at', type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  // ==================== INFORMACIÓN FINANCIERA ====================
  @Column({
    name: 'final_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  finalAmount: number | null;

  @Column({ name: 'discount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

  // ==================== CANCELACIÓN ====================
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelled_by' })
  canceller: User | null;

  @Column({ name: 'cancelled_by', type: 'int', nullable: true })
  cancelledBy: number | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  // ==================== RATING ====================
  @Column({ name: 'rating', type: 'tinyint', unsigned: true, nullable: true })
  rating: number | null; // 1-5

  @Column({ name: 'rating_comment', type: 'text', nullable: true })
  ratingComment: string | null;

  @Column({ name: 'rated_at', type: 'datetime', nullable: true })
  ratedAt: Date | null;

  // ==================== AUDITORÍA ====================
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  // ==================== RELACIONES ====================
  // @OneToMany(() => TicketItemDiagnosis, (diagnosis) => diagnosis.ticketItem)
  // diagnoses: TicketItemDiagnosis[];

  // @OneToMany(() => Quote, (quote) => quote.ticketItem)
  // quotes: Quote[];
}
