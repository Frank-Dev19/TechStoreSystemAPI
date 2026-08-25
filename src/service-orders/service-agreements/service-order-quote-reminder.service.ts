import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';
import { ServiceOrderCommercialIssuanceService } from './service-order-commercial-issuance.service';

@Injectable()
export class ServiceOrderQuoteReminderService {
  private readonly logger = new Logger(ServiceOrderQuoteReminderService.name);

  constructor(
    @InjectRepository(ServiceOrderItemCommercialVersion)
    private readonly versionRepository: Repository<ServiceOrderItemCommercialVersion>,
    private readonly issuanceService: ServiceOrderCommercialIssuanceService,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(process.env.SERVICE_ORDER_NOTIFICATION_SCHEDULER_CRON || '0 */15 * * * *')
  async dispatchDueReminders(): Promise<void> {
    const hours = this.positiveNumber('SERVICE_ORDER_QUOTE_REMINDER_HOURS', 48);
    const versions = await this.versionRepository.find({
      where: {
        status: ServiceOrderItemCommercialVersionStatus.ISSUED,
        issuedAt: LessThanOrEqual(new Date(Date.now() - hours * 3_600_000)),
      },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder', 'decisions'],
      take: 100,
      order: { issuedAt: 'ASC' },
    });

    for (const version of versions.filter((candidate) => !(candidate.decisions ?? []).length)) {
      try {
        if (await this.messageMatrixService.hasNotification(`commercial_version:${version.id}:quote-reminder`)) continue;
        const generated = await this.issuanceService.createReminderDocument(version.id);
        const tempDocument = await this.tempDocumentsService.createRecord({
          sourceType: 'QUOTE_REMINDER',
          mimeType: 'application/pdf',
          fileName: generated.fileName,
          absolutePath: generated.absolutePath,
          metadata: { commercialVersionId: version.id, serviceOrderItemId: version.serviceOrderItemId },
        });
        const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(/\/+$/, '');
        const item = version.serviceOrderItem;
        await this.messageMatrixService.dispatchQuoteReminderTemplate({
          serviceOrder: item.serviceOrder,
          commercialVersionId: version.id,
          equipmentLabel: [item.equipmentTypeOther || item.equipmentType, item.brand, item.model].filter(Boolean).join(' '),
          totalAmount: Number(version.totalAmount),
          documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
          documentFileName: generated.fileName,
          tempDocumentToken: tempDocument.token,
        });
      } catch (error) {
        this.logger.error(`No se pudo preparar el recordatorio de la cotización ${version.id}: ${(error as Error).message}`);
      }
    }
  }

  private positiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
