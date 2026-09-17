import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { Serial } from '../../inventory/entities/serial.entity';

@Entity('material_deliveries')
export class MaterialDelivery {
  @ManyToOne(() => ServiceOrderItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item: ServiceOrderItem;
  @ManyToOne(() => ServiceOrderItemCommercialVersion, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'versionId' })
  version: ServiceOrderItemCommercialVersion;
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'enum', enum: ['ORDER', 'MANUAL'], default: 'ORDER' })
  type: 'ORDER' | 'MANUAL';
  @Index()
  @Column({ type: 'bigint', unsigned: true, nullable: true })
  serviceOrderId: number | null;
  @Index() @Column({ type: 'bigint', unsigned: true, nullable: true }) itemId:
    | number
    | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) versionId:
    | number
    | null;
  @Column({ type: 'bigint', unsigned: true }) technicianId: number;
  @Column({ type: 'bigint', unsigned: true }) actorId: number;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('material_delivery_lines')
export class MaterialDeliveryLine {
  @ManyToOne(() => MaterialDelivery, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'deliveryId' })
  delivery: MaterialDelivery;
  @ManyToOne(() => Serial, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'serialId' })
  serial: Serial | null;
  @ManyToOne(() => ServiceOrderItemCommercialLine, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'commercialLineId' })
  commercialLine: ServiceOrderItemCommercialLine;
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() deliveryId: number;
  @Index() @Column({ type: 'bigint', unsigned: true, nullable: true }) itemId:
    | number
    | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) commercialLineId:
    | number
    | null;
  @Column() productId: number;
  @Column({ type: 'varchar', length: 256, nullable: true })
  productNameSnapshot: string | null;
  @Column({ type: 'int', nullable: true }) lotId: number | null;
  @Index() @Column({ type: 'int', nullable: true }) serialId: number | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) serialCode:
    | string
    | null;
  @Column({ type: 'decimal', precision: 14, scale: 4 }) quantity: number;
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  returnedQuantity: number;
  @Column({ type: 'decimal', precision: 14, scale: 4 }) unitCost: number;
  @Column() movementId: number;
  @Column({ type: 'int', nullable: true }) saleId: number | null;
}

@Entity('material_returns')
export class MaterialReturn {
  @ManyToOne(() => MaterialDeliveryLine, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'deliveryLineId' })
  deliveryLine: MaterialDeliveryLine;
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() deliveryLineId: number;
  @Column({ type: 'decimal', precision: 14, scale: 4 }) quantity: number;
  @Column() faulty: boolean;
  @Column({ type: 'text' }) reason: string;
  @Column() movementId: number;
  @Column({ type: 'bigint', unsigned: true }) actorId: number;
  @CreateDateColumn() createdAt: Date;
}

export type MaterialAllocation = {
  commercialLineId: number;
  deliveryLineId: number;
  quantity: number;
};
@Entity('material_reconciliations')
export class MaterialReconciliation {
  @ManyToOne(() => ServiceOrderItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item: ServiceOrderItem;
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true })
  @Column({ type: 'bigint', unsigned: true })
  itemId: number;
  @Column({ type: 'bigint', unsigned: true }) versionId: number;
  @Column({ type: 'json' }) allocations: MaterialAllocation[];
  @Column({ default: true }) valid: boolean;
  @Column({ type: 'bigint', unsigned: true }) actorId: number;
  @Column({ type: 'datetime' }) confirmedAt: Date;
}

@Entity('material_operations')
export class MaterialOperation {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true }) @Column({ length: 64 }) requestKey: string;
  @Column({ length: 64 }) fingerprint: string;
  @Column({ length: 96 }) action: string;
  @Column({ type: 'bigint', unsigned: true }) actorId: number;
  @Column({ type: 'json' }) result: Record<string, unknown>;
  @CreateDateColumn() createdAt: Date;
}
