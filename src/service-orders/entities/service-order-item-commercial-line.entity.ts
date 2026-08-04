import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';
import { ServiceOrderItemCommercialVersion } from './service-order-item-commercial-version.entity';
import { ServiceOrderLineDiscount } from '../service-agreements/entities/service-order-line-discount.entity';

@Entity('service_order_item_commercial_lines')
export class ServiceOrderItemCommercialLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'commercial_version_id', type: 'bigint', unsigned: true })
  commercialVersionId: number;

  @ManyToOne(
    () => ServiceOrderItemCommercialVersion,
    (version) => version.lines,
    { nullable: false, onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'commercial_version_id' })
  commercialVersion: ServiceOrderItemCommercialVersion;

  @Column({ type: 'enum', enum: ServiceOrderCommercialLineType })
  type: ServiceOrderCommercialLineType;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'service_id', type: 'int', unsigned: true, nullable: true })
  serviceId: number | null;

  @Column({ name: 'catalog_code_snapshot', type: 'varchar', length: 100 })
  catalogCodeSnapshot: string;

  @Column({ name: 'catalog_name_snapshot', type: 'varchar', length: 180 })
  catalogNameSnapshot: string;

  @Column({
    name: 'catalog_description_snapshot',
    type: 'text',
    nullable: true,
  })
  catalogDescriptionSnapshot: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 12, scale: 2 })
  grossAmount: number;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  discountAmount: number;

  @Column({ name: 'net_amount', type: 'decimal', precision: 12, scale: 2 })
  netAmount: number;

  @Column({ name: 'requires_purchase', type: 'boolean', default: false })
  requiresPurchase: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(
    () => ServiceOrderLineDiscount,
    (discount) => discount.commercialLine,
  )
  discounts?: ServiceOrderLineDiscount[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
