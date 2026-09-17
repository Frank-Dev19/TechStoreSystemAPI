import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('serial_condition_events')
export class SerialConditionEvent {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() serialId: number;
  @Column({ length: 16 }) previousCondition: string;
  @Column({ length: 16 }) condition: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'bigint', unsigned: true }) actorId: number;
  @Column({ type: 'int', nullable: true }) returnId: number | null;
  @CreateDateColumn() createdAt: Date;
}
