import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WarrantyDurationUnit } from '../../common/enums/warranty-duration-unit.enum';
import { Client } from '../../clients/entities/client.entity';
import { Product } from '../../inventory/entities/product.entity';
import { Serial } from '../../inventory/entities/serial.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';
import { ServiceOrder } from '../../service-orders/entities/service-order.entity';
import { ServiceOrderItem } from '../../service-orders/entities/service-order-item.entity';
import { User } from '../../users/entities/user.entity';
import { WarrantyClaim } from './warranty-claim.entity';
import { WarrantyCoverageStatus } from '../enums/warranty-coverage-status.enum';
import { WarrantySourceType } from '../enums/warranty-source-type.enum';

@Entity('warranty_coverages')
@Index('UQ_warranty_coverage_source_unit', ['sourceType', 'sourceUnitKey'], { unique: true })
@Index('IDX_warranty_coverage_customer_status', ['customerId', 'status'])
export class WarrantyCoverage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'source_type', type: 'enum', enum: WarrantySourceType })
  sourceType: WarrantySourceType;

  @Column({ name: 'source_unit_key', type: 'varchar', length: 100 })
  sourceUnitKey: string;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId: number;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Client;

  @Column({ name: 'sale_id', type: 'int', nullable: true })
  saleId: number | null;

  @ManyToOne(() => Sale, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale | null;

  @Column({ name: 'sale_item_id', type: 'int', nullable: true })
  saleItemId: number | null;

  @ManyToOne(() => SaleItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sale_item_id' })
  saleItem: SaleItem | null;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderId: number | null;

  @ManyToOne(() => ServiceOrder, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder | null;

  @Column({ name: 'service_order_item_id', type: 'bigint', unsigned: true, nullable: true })
  serviceOrderItemId: number | null;

  @ManyToOne(() => ServiceOrderItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_order_item_id' })
  serviceOrderItem: ServiceOrderItem | null;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'serial_id', type: 'int', nullable: true })
  serialId: number | null;

  @ManyToOne(() => Serial, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'serial_id' })
  serial: Serial | null;

  @Column({ name: 'source_code_snapshot', type: 'varchar', length: 120 })
  sourceCodeSnapshot: string;

  @Column({ name: 'source_name_snapshot', type: 'varchar', length: 255 })
  sourceNameSnapshot: string;

  @Column({ name: 'serial_snapshot', type: 'varchar', length: 120, nullable: true })
  serialSnapshot: string | null;

  @Column({ name: 'origin_technician_id', type: 'int', nullable: true })
  originTechnicianId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'origin_technician_id' })
  originTechnician: User | null;

  @Column({ name: 'origin_technician_name_snapshot', type: 'varchar', length: 150, nullable: true })
  originTechnicianNameSnapshot: string | null;

  @Column({ name: 'duration_value', type: 'int', unsigned: true })
  durationValue: number;

  @Column({ name: 'duration_unit', type: 'enum', enum: WarrantyDurationUnit })
  durationUnit: WarrantyDurationUnit;

  @Column({ name: 'starts_at', type: 'datetime' })
  startsAt: Date;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'coverage_amount', type: 'decimal', precision: 10, scale: 2 })
  coverageAmount: number;

  @Column({ type: 'enum', enum: WarrantyCoverageStatus, default: WarrantyCoverageStatus.ACTIVE })
  status: WarrantyCoverageStatus;

  @Column({ name: 'consumed_at', type: 'datetime', nullable: true })
  consumedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @OneToMany(() => WarrantyClaim, (claim) => claim.coverage)
  claims: WarrantyClaim[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
