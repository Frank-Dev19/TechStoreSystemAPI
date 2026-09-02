import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WarrantyClaim } from './warranty-claim.entity';
import { WarrantyCoverage } from './warranty-coverage.entity';
import { WarrantyMovementType } from '../enums/warranty-movement-type.enum';

@Entity('warranty_movements')
export class WarrantyMovement {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'coverage_id', type: 'bigint', unsigned: true })
  coverageId: number;

  @ManyToOne(() => WarrantyCoverage, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coverage_id' })
  coverage: WarrantyCoverage;

  @Column({ name: 'claim_id', type: 'bigint', unsigned: true, nullable: true })
  claimId: number | null;

  @ManyToOne(() => WarrantyClaim, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'claim_id' })
  claim: WarrantyClaim | null;

  @Column({ type: 'enum', enum: WarrantyMovementType })
  type: WarrantyMovementType;

  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  @Column({ name: 'actor_name_snapshot', type: 'varchar', length: 150, nullable: true })
  actorNameSnapshot: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'metadata_json', type: 'json', nullable: true })
  metadataJson: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
