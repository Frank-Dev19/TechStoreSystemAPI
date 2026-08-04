import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { ServiceOrderItemCommercialVersion } from '../../entities/service-order-item-commercial-version.entity';
import { ServiceOrderClientDecisionChannel } from '../service-order-client-decision-channel.enum';
import { ServiceOrderClientDecisionType } from '../service-order-client-decision-type.enum';

@Entity('service_order_client_decisions')
@Index('IDX_service_order_client_decision_version', ['commercialVersionId'])
export class ServiceOrderClientDecision {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'commercial_version_id', type: 'bigint', unsigned: true })
  commercialVersionId: number;

  @ManyToOne(
    () => ServiceOrderItemCommercialVersion,
    (version) => version.decisions,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'commercial_version_id' })
  commercialVersion: ServiceOrderItemCommercialVersion;

  @Column({ type: 'enum', enum: ServiceOrderClientDecisionType })
  decision: ServiceOrderClientDecisionType;

  @Column({ type: 'enum', enum: ServiceOrderClientDecisionChannel })
  channel: ServiceOrderClientDecisionChannel;

  @Column({ type: 'text', nullable: true })
  observation: string | null;

  @Column({ name: 'recorded_by_user_id', type: 'int' })
  recordedByUserId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by_user_id' })
  recordedByUser: User;

  @Column({ name: 'recorded_at', type: 'datetime' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
