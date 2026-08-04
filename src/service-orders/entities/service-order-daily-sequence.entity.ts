import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('service_order_daily_sequences')
export class ServiceOrderDailySequence {
  @PrimaryColumn({ name: 'business_date', type: 'date' })
  businessDate: string;

  @Column({ name: 'last_value', type: 'int', unsigned: true })
  lastValue: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
