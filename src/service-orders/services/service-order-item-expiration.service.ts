import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderItemStatus, ServiceType } from '../enums';
import { ServiceOrderItemService } from './service-order-item.service';

/**
 * Revisa periódicamente los service order items en estado QUOTED y marca la oferta como expirada
 * cuando superan el umbral configurado.
 */
@Injectable()
export class ServiceOrderItemExpirationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServiceOrderItemExpirationService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ServiceOrderItem)
    private readonly serviceOrderItemRepository: Repository<ServiceOrderItem>,
    private readonly serviceOrderItemService: ServiceOrderItemService,
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
      const candidates = await this.serviceOrderItemRepository.find({
        where: {
          serviceType: ServiceType.STANDARD_SERVICE,
          status: ServiceOrderItemStatus.QUOTED,
          quotedAt: LessThan(threshold),
          deletedAt: IsNull(),
        },
        select: ['id', 'status', 'quotedAt', 'serviceOrderId'],
      });

      for (const item of candidates) {
        try {
          await this.serviceOrderItemService.changeStatus(item.id, ServiceOrderItemStatus.QUOTE_EXPIRED);
        } catch (error) {
          this.logger.warn(
            `No se pudo expirar el item ${item.id} (service order ${item.serviceOrderId}): ${error?.message ?? error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error al buscar cotizaciones expiradas: ${error?.message ?? error}`);
    }
  }
}
