import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export const SERVICE_ORDER_CLOCK = Symbol('SERVICE_ORDER_CLOCK');

export type AllocatedServiceOrderCodes = {
  parentCode: string;
  itemCodes: string[];
  businessDate: string;
  sequenceNumber: number;
};

@Injectable()
export class ServiceOrderCodeService {
  constructor(
    @Optional()
    @Inject(SERVICE_ORDER_CLOCK)
    private readonly nowFactory: () => Date = () => new Date(),
  ) {}

  async allocate(manager: EntityManager, itemCount: number): Promise<AllocatedServiceOrderCodes> {
    if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 99) {
      throw new BadRequestException('At least one service-order item is required and no more than 99 are allowed');
    }

    const businessDate = this.getLimaBusinessDate(this.nowFactory());
    await manager.query(
      `INSERT INTO \`service_order_daily_sequences\` (\`business_date\`, \`last_value\`)
       VALUES (?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE \`last_value\` = LAST_INSERT_ID(\`last_value\` + 1)`,
      [businessDate],
    );
    const rows = (await manager.query('SELECT LAST_INSERT_ID() AS sequenceNumber')) as Array<{
      sequenceNumber: number | string;
    }>;
    const sequenceNumber = Number(rows[0]?.sequenceNumber ?? 0);
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
      throw new BadRequestException('Could not allocate the service-order daily sequence');
    }

    const [year, month, day] = businessDate.split('-');
    const parentCode = `SO-${day}-${month}-${year}-${String(sequenceNumber).padStart(4, '0')}`;
    const itemCodes = Array.from(
      { length: itemCount },
      (_, index) => `${parentCode}-${String(index + 1).padStart(2, '0')}`,
    );

    return { parentCode, itemCodes, businessDate, sequenceNumber };
  }

  private getLimaBusinessDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
}
