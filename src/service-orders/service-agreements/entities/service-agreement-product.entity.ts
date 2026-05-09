import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceOrderAgreement } from './service-agreement.entity';
import { Product } from '../../../inventory/entities/product.entity';
import { ServiceOrderAgreementLineProvenance } from '../service-agreement-line-provenance.enum';

@Entity('service_order_agreement_products')
export class ServiceOrderAgreementProduct {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @ManyToOne(() => ServiceOrderAgreement, (quote) => quote.productItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_agreement_id' })
  serviceOrderAgreement: ServiceOrderAgreement;

  @Column({ name: 'service_order_agreement_id', type: 'bigint', unsigned: true })
  serviceOrderAgreementId: number;

  @ManyToOne(() => Product, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number | null;

  @Column({ name: 'product_code_snapshot', type: 'varchar', length: 50 })
  productCodeSnapshot: string;

  @Column({ name: 'product_name_snapshot', type: 'varchar', length: 150 })
  productNameSnapshot: string;

  @Column({ name: 'product_description_snapshot', type: 'text', nullable: true })
  productDescriptionSnapshot: string | null;

  @Column({ name: 'quantity', type: 'decimal', precision: 10, scale: 2, default: 1 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 10, scale: 2 })
  lineTotal: number;

  @Column({ name: 'requires_purchase', type: 'boolean', default: false })
  requiresPurchase: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({
    name: 'provenance',
    type: 'enum',
    enum: ServiceOrderAgreementLineProvenance,
    default: ServiceOrderAgreementLineProvenance.NEW,
  })
  provenance: ServiceOrderAgreementLineProvenance;

  @Column({ name: 'derived_from_agreement_product_item_id', type: 'bigint', unsigned: true, nullable: true })
  derivedFromAgreementProductItemId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}


