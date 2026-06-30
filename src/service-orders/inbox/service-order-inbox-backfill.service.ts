import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceOrderInboxService } from './service-order-inbox.service';

@Injectable()
export class ServiceOrderInboxBackfillService implements OnModuleInit {
  private readonly logger = new Logger(ServiceOrderInboxBackfillService.name);

  constructor(
    private readonly inboxService: ServiceOrderInboxService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<string>('SERVICE_ORDER_INBOX_BACKFILL_ON_BOOT');
    if (String(enabled ?? 'true').trim().toLowerCase() === 'false') {
      return;
    }

    const consolidated = await this.inboxService.consolidateHistoricalThreads();
    if (consolidated > 0) {
      this.logger.log(`service-order-inbox consolidated ${consolidated} historical duplicate thread(s)`);
    }
  }
}
