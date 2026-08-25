import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceOrderIntakePdfService } from '../documents/service-order-intake-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

@Injectable()
export class ServiceOrderIntakeNotificationService {
  private readonly logger = new Logger(ServiceOrderIntakeNotificationService.name);

  constructor(
    private readonly intakePdfService: ServiceOrderIntakePdfService,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly configService: ConfigService,
  ) {}

  async notifyOrders(serviceOrders: ServiceOrder[]): Promise<void> {
    for (const serviceOrder of serviceOrders.filter(Boolean)) {
      await this.notifyOrder(serviceOrder);
    }
  }

  private async notifyOrder(serviceOrder: ServiceOrder): Promise<void> {
    if (!serviceOrder.clientSnapshotPhone?.trim()) {
      this.logger.warn(`Intake summary skipped for order ${serviceOrder.id}: customer phone is missing`);
      return;
    }

    try {
      const items = this.resolveItems(serviceOrder);
      const generatedPdf = await this.intakePdfService.generateSingleOrderSummary({
        code: serviceOrder.code,
        createdAt: serviceOrder.createdAt ?? new Date(),
        operativeStatus: serviceOrder.operativeStatus,
        serviceType: serviceOrder.serviceType,
        clientName: serviceOrder.clientSnapshotName ?? serviceOrder.client?.name ?? null,
        clientDocument:
          [serviceOrder.clientSnapshotDocumentTypeName, serviceOrder.clientSnapshotDocumentNumber]
            .filter(Boolean)
            .join(': ') || null,
        clientPhone: serviceOrder.clientSnapshotPhone ?? serviceOrder.client?.phone ?? null,
        clientEmail: serviceOrder.clientSnapshotEmail ?? serviceOrder.client?.email ?? null,
        items: items.map((item) => ({
          position: item.position,
          code: item.code,
          priority: item.priority,
          equipmentType: item.equipmentTypeOther?.trim() || item.equipmentType,
          brand: item.brand ?? null,
          model: item.model ?? null,
          serialNumber: item.serialNumber ?? null,
          accessories: item.accessories ?? null,
          notes: item.notes ?? null,
          initialIssue: item.initialIssue,
        })),
      });

      const tempDocument = await this.tempDocumentsService.createRecord({
        sourceType: 'ORDER_INTAKE_SUMMARY',
        mimeType: generatedPdf.mimeType,
        fileName: generatedPdf.fileName,
        absolutePath: generatedPdf.absolutePath,
        metadata: {
          orderIds: [serviceOrder.id],
          recipient: serviceOrder.clientSnapshotPhone,
          templateName:
            this.configService.get<string>('WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME') ||
            'resumen_de_orden_de_servicio',
        },
      });

      const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(
        /\/+$/,
        '',
      );
      await this.messageMatrixService.dispatchOrderIntakeTemplate({
        serviceOrders: [serviceOrder],
        equipmentCount: this.formatEquipmentCount(items.length),
        documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
        documentFileName: generatedPdf.fileName,
        tempDocumentToken: tempDocument.token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown intake notification error';
      this.logger.error(`Intake summary preparation failed for order ${serviceOrder.id}: ${message}`);
    }
  }

  private resolveItems(serviceOrder: ServiceOrder): ServiceOrderItem[] {
    return [...(serviceOrder.items ?? [])].sort(
      (left, right) => left.position - right.position || left.code.localeCompare(right.code),
    );
  }

  private formatEquipmentCount(count: number): string {
    return `${count} ${count === 1 ? 'equipo' : 'equipos'}`;
  }
}
