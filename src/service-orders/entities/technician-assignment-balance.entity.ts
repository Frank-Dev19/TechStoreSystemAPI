import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ServiceType } from '../enums';

@Entity('technician_assignment_balances')
@Unique('uq_technician_assignment_balance', ['technicianId', 'serviceType'])
export class TechnicianAssignmentBalance {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => User, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technician_id' })
  technician: User;

  @Column({ name: 'technician_id', type: 'int' })
  technicianId: number;

  @Column({ name: 'service_type', type: 'enum', enum: ServiceType })
  serviceType: ServiceType;

  @Column({ name: 'assigned_count', type: 'int', unsigned: true, default: 0 })
  assignedCount: number;

  @Column({ name: 'active_count', type: 'int', unsigned: true, default: 0 })
  activeCount: number;

  @Column({ name: 'last_assigned_at', type: 'datetime', nullable: true })
  lastAssignedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
