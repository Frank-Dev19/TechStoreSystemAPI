import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  Column,
} from 'typeorm';
import { ServiceOrderItemCommercialVersion } from '../../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItem } from '../../entities/service-order-item.entity';
import { ServiceOrderAgreement } from './service-agreement.entity';

@Entity('service_order_agreement_items')
@Unique('UQ_service_order_agreement_item', [
  'serviceOrderAgreementId',
  'serviceOrderItemId',
])
export class ServiceOrderAgreementItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({
    name: 'service_order_agreement_id',
    type: 'bigint',
    unsigned: true,
  })
  serviceOrderAgreementId: number;

  @ManyToOne(() => ServiceOrderAgreement, (agreement) => agreement.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_order_agreement_id' })
  serviceOrderAgreement: ServiceOrderAgreement;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true })
  serviceOrderItemId: number;

  @ManyToOne(() => ServiceOrderItem, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_item_id' })
  serviceOrderItem: ServiceOrderItem;

  @Column({ name: 'commercial_version_id', type: 'bigint', unsigned: true })
  commercialVersionId: number;

  @ManyToOne(() => ServiceOrderItemCommercialVersion, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'commercial_version_id' })
  commercialVersion: ServiceOrderItemCommercialVersion;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
