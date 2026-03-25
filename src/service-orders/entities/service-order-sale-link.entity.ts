import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceOrder } from './service-order.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';

@Entity('service_order_sale_links')
export class ServiceOrderSaleLink {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'service_order_id', type: 'bigint', unsigned: true })
  serviceOrderId: number;

  @ManyToOne(() => ServiceOrder, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder: ServiceOrder;

  @Column({ name: 'sale_id', type: 'int' })
  saleId: number;

  @ManyToOne(() => Sale, { eager: true, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'agreement_id', type: 'bigint', unsigned: true, nullable: true })
  agreementId: number | null;

  @ManyToOne(() => ServiceOrderAgreement, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agreement_id' })
  agreement: ServiceOrderAgreement | null;

  @Column({ name: 'linked_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  linkedAmount: number;

  @Column({ name: 'linked_by', type: 'varchar', length: 100, nullable: true })
  linkedBy: string | null;

  @Column({ name: 'linked_at', type: 'datetime' })
  linkedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
