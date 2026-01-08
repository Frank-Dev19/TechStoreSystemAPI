import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { TicketItem } from '../entities/ticket-item.entity';
import { TicketItemStatus, ServiceType } from '../enums';
import { TicketItemService } from './ticket-item.service';

/**
 * Revisa periódicamente los ticket items en estado QUOTED y los marca como expirada la oferta
 * cuando superan el umbral configurado.
 */
@Injectable()
export class TicketItemExpirationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketItemExpirationService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    private readonly ticketItemService: TicketItemService,
  ) {}

  onModuleInit(): void {
    const intervalMinutes = this.parseNumber(process.env.STANDARD_QUOTE_SWEEP_MINUTES, 30);
    // Primera corrida inmediata para no esperar al intervalo
    void this.expireQuotedItems();
    this.timer = setInterval(() => {
      void this.expireQuotedItems();
    }, intervalMinutes * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private parseNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async expireQuotedItems(): Promise<void> {
    const expirationHours = this.parseNumber(process.env.STANDARD_QUOTE_EXPIRATION_HOURS, 48);
    if (expirationHours <= 0) {
      return;
    }

    const threshold = new Date(Date.now() - expirationHours * 60 * 60 * 1000);

    try {
      const candidates = await this.ticketItemRepository.find({
        where: {
          serviceType: ServiceType.STANDARD_SERVICE,
          status: TicketItemStatus.QUOTED,
          quotedAt: LessThan(threshold),
          deletedAt: IsNull(),
        },
        select: ['id', 'status', 'quotedAt', 'ticketId'],
      });

      for (const item of candidates) {
        try {
          await this.ticketItemService.changeStatus(item.id, TicketItemStatus.QUOTE_EXPIRED);
        } catch (error) {
          this.logger.warn(
            `No se pudo expirar el item ${item.id} (ticket ${item.ticketId}): ${error?.message ?? error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error al buscar cotizaciones expiradas: ${error?.message ?? error}`);
    }
  }
}
