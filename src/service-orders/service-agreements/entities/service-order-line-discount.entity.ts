import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PricingConfig } from '../../../pricing/entities/pricing-config.entity';
import { User } from '../../../users/entities/user.entity';
import { ServiceOrderItemCommercialLine } from '../../entities/service-order-item-commercial-line.entity';

@Entity('service_order_line_discounts')
@Index('IDX_service_order_line_discount_line', ['commercialLineId'])
export class ServiceOrderLineDiscount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'commercial_line_id', type: 'bigint', unsigned: true })
  commercialLineId: number;

  @ManyToOne(() => ServiceOrderItemCommercialLine, (line) => line.discounts, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'commercial_line_id' })
  commercialLine: ServiceOrderItemCommercialLine;

  @Column({
    name: 'pricing_config_id',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  pricingConfigId: number | null;

  @ManyToOne(() => PricingConfig, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pricing_config_id' })
  pricingConfig: PricingConfig | null;

  @Column({ name: 'rule_name', type: 'varchar', length: 160 })
  ruleName: string;

  @Column({ type: 'enum', enum: ['PERCENTAGE'], default: 'PERCENTAGE' })
  type: 'PERCENTAGE';

  @Column({ type: 'decimal', precision: 8, scale: 4 })
  percentage: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'max_allowed_pct', type: 'decimal', precision: 8, scale: 4 })
  maxAllowedPct: number;

  @Column({ name: 'was_limit_overridden', type: 'boolean', default: false })
  wasLimitOverridden: boolean;

  @Column({
    name: 'override_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  overrideReason: string | null;

  @Column({ name: 'applied_by_user_id', type: 'int' })
  appliedByUserId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applied_by_user_id' })
  appliedByUser: User;

  @Column({ name: 'authorized_by_user_id', type: 'int', nullable: true })
  authorizedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorized_by_user_id' })
  authorizedByUser: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
