import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';
import { ServiceOrderItemCommercialLine } from './service-order-item-commercial-line.entity';
import { ServiceOrderItem } from './service-order-item.entity';
import { ServiceOrderClientDecision } from '../service-agreements/entities/service-order-client-decision.entity';
import { WarrantyDurationUnit } from '../../common/enums/warranty-duration-unit.enum';

@Entity('service_order_item_commercial_versions')
@Unique('UQ_service_order_item_commercial_version', ['serviceOrderItemId', 'versionNumber'])
export class ServiceOrderItemCommercialVersion {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true })
  serviceOrderItemId: number;

  @ManyToOne(() => ServiceOrderItem, (item) => item.commercialVersions, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_item_id' })
  serviceOrderItem: ServiceOrderItem;

  @Column({ name: 'derived_from_version_id', type: 'bigint', unsigned: true, nullable: true })
  derivedFromVersionId: number | null;

  @ManyToOne(() => ServiceOrderItemCommercialVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'derived_from_version_id' })
  derivedFromVersion: ServiceOrderItemCommercialVersion | null;

  @Column({ name: 'version_number', type: 'int', unsigned: true })
  versionNumber: number;

  @Column({ type: 'enum', enum: ServiceOrderItemCommercialVersionStatus })
  status: ServiceOrderItemCommercialVersionStatus;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ name: 'warranty_duration_value', type: 'int', unsigned: true, default: 30 })
  warrantyDurationValue: number;

  @Column({
    name: 'warranty_duration_unit',
    type: 'enum',
    enum: WarrantyDurationUnit,
    default: WarrantyDurationUnit.DAY,
  })
  warrantyDurationUnit: WarrantyDurationUnit;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'bigint', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'accepted_at', type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'issued_at', type: 'datetime', nullable: true })
  issuedAt: Date | null;

  @Column({ name: 'accepted_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  acceptedByUserId: number | null;

  @OneToMany(() => ServiceOrderItemCommercialLine, (line) => line.commercialVersion, { cascade: true })
  lines: ServiceOrderItemCommercialLine[];

  @OneToMany(() => ServiceOrderClientDecision, (decision) => decision.commercialVersion)
  decisions: ServiceOrderClientDecision[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
