import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderDiagnosisStatus } from '../diagnoses/service-order-diagnosis-status.enum';
import { ServiceOrderFinalReportPdfService } from '../documents/service-order-final-report-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

@Injectable()
export class ServiceOrderFinalReportNotificationService {
  private readonly logger = new Logger(ServiceOrderFinalReportNotificationService.name);

  constructor(
    @InjectRepository(ServiceOrder)
    private readonly orderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderItem)
    private readonly itemRepository: Repository<ServiceOrderItem>,
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly diagnosisRepository: Repository<ServiceOrderDiagnosis>,
    private readonly pdfService: ServiceOrderFinalReportPdfService,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly configService: ConfigService,
  ) {}

  async notifyResolvedItem(serviceOrderId: number, itemId: number): Promise<void> {
    try {
      const [order, item, diagnosis] = await Promise.all([
        this.orderRepository.findOne({ where: { id: serviceOrderId } }),
        this.itemRepository.findOne({ where: { id: itemId, serviceOrderId } }),
        this.diagnosisRepository.findOne({
          where: { serviceOrderItemId: itemId, status: ServiceOrderDiagnosisStatus.CURRENT },
          order: { sequenceNumber: 'DESC' },
        }),
      ]);
      if (!order || !item) {
        this.logger.warn(`Final report skipped because order ${serviceOrderId} or item ${itemId} was not found`);
        return;
      }

      const generatedPdf = await this.pdfService.generate({
        orderCode: order.code,
        itemCode: item.code,
        clientName: order.clientSnapshotName?.trim() || 'Cliente',
        clientPhone: order.clientSnapshotPhone,
        clientEmail: order.clientSnapshotEmail,
        equipmentLabel: this.equipmentLabel(item),
        serialNumber: item.serialNumber,
        initialIssue: item.initialIssue,
        diagnosisSummary: diagnosis?.summary ?? null,
        diagnosisDetails: diagnosis?.details ?? null,
        recommendedAction: diagnosis?.recommendedAction ?? null,
        completedAt: item.serviceCompletedAt ?? item.resolvedAt ?? new Date(),
        pickupPolicy: {
          freeStorageDays: this.positiveNumber('SERVICE_ORDER_PICKUP_FREE_STORAGE_DAYS', 7),
          dailyStorageFee: this.positiveNumber('SERVICE_ORDER_PICKUP_DAILY_STORAGE_FEE', 2),
          reminderDay: this.positiveNumber('SERVICE_ORDER_PICKUP_REMINDER_DAY', 30),
          administrativeReviewDay: this.positiveNumber('SERVICE_ORDER_PICKUP_ADMIN_REVIEW_DAY', 90),
          provisional: this.configService.get<string>('SERVICE_ORDER_PICKUP_POLICY_PROVISIONAL') !== 'false',
        },
      });
      const tempDocument = await this.tempDocumentsService.createRecord({
        sourceType: 'FINAL_SERVICE_REPORT',
        mimeType: generatedPdf.mimeType,
        fileName: generatedPdf.fileName,
        absolutePath: generatedPdf.absolutePath,
        metadata: { serviceOrderId, serviceOrderItemId: itemId },
      });
      const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(
        /\/+$/,
        '',
      );
      await this.messageMatrixService.dispatchFinalServiceReportTemplate({
        serviceOrder: order,
        serviceOrderItemId: item.id,
        equipmentLabel: this.equipmentLabel(item),
        itemCode: item.code,
        documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
        documentFileName: generatedPdf.fileName,
        tempDocumentToken: tempDocument.token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown final report error';
      this.logger.error(
        `Item ${itemId} was resolved but its final service report could not be sent: ${message}`,
      );
    }
  }

  private equipmentLabel(item: ServiceOrderItem): string {
    return [item.equipmentTypeOther?.trim() || item.equipmentType, item.brand?.trim(), item.model?.trim()]
      .filter(Boolean)
      .join(' ');
  }

  private positiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
