import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { ServiceOrderDiagnosisQuotePdfService } from '../documents/service-order-diagnosis-quote-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderDiagnosisStatus } from '../diagnoses/service-order-diagnosis-status.enum';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';

@Injectable()
export class ServiceOrderCommercialIssuanceService {
  constructor(
    @InjectRepository(ServiceOrderItemCommercialVersion)
    private readonly versionRepository: Repository<ServiceOrderItemCommercialVersion>,
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly diagnosisRepository: Repository<ServiceOrderDiagnosis>,
    private readonly pdfService: ServiceOrderDiagnosisQuotePdfService,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly configService: ConfigService,
  ) {}

  async preview(versionId: number): Promise<{ fileName: string; buffer: Buffer }> {
    const context = await this.loadContext(versionId);
    if (context.version.status !== ServiceOrderItemCommercialVersionStatus.DRAFT) {
      throw new BadRequestException('Solo se puede previsualizar como borrador una cotización en edición');
    }
    return {
      fileName: `${context.version.serviceOrderItem.code}-cotizacion-borrador.pdf`,
      buffer: await this.buildPdf(context.version, context.diagnosis, true),
    };
  }

  async issue(versionId: number): Promise<{ version: ServiceOrderItemCommercialVersion; deliveryStatus: string }> {
    const context = await this.loadContext(versionId);
    const { version, diagnosis } = context;
    if (![ServiceOrderItemCommercialVersionStatus.DRAFT, ServiceOrderItemCommercialVersionStatus.ISSUED].includes(version.status)) {
      throw new BadRequestException('La cotización ya no está disponible para envío');
    }
    const fileName = `${version.serviceOrderItem.code}-diagnostico-cotizacion-v${version.versionNumber}.pdf`;
    const buffer = await this.buildPdf(version, diagnosis, false);
    const directory = join(process.cwd(), 'storage', 'temp', 'service-orders');
    await fs.mkdir(directory, { recursive: true });
    const absolutePath = join(directory, `${version.id}-${fileName}`);
    await fs.writeFile(absolutePath, buffer);
    const tempDocument = await this.tempDocumentsService.createRecord({
      sourceType: 'DIAGNOSIS_QUOTE', mimeType: 'application/pdf', fileName, absolutePath,
      metadata: { commercialVersionId: version.id, serviceOrderItemId: version.serviceOrderItemId },
    });
    if (version.status === ServiceOrderItemCommercialVersionStatus.DRAFT) {
      version.status = ServiceOrderItemCommercialVersionStatus.ISSUED;
      version.issuedAt = new Date();
      await this.versionRepository.save(version);
    } else if (!version.issuedAt) {
      version.issuedAt = version.createdAt ?? new Date();
      await this.versionRepository.save(version);
    }
    const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(/\/+$/, '');
    const item = version.serviceOrderItem;
    const deliveryStatus = await this.messageMatrixService.dispatchDiagnosisQuoteTemplate({
      serviceOrder: item.serviceOrder,
      commercialVersionId: version.id,
      equipmentLabel: this.equipmentLabel(item),
      totalAmount: Number(version.totalAmount),
      documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
      documentFileName: fileName,
      tempDocumentToken: tempDocument.token,
      isRediagnosis:
        version.derivedFromVersionId != null || Number(version.versionNumber) > 1,
    });
    return { version, deliveryStatus };
  }

  async createReminderDocument(versionId: number): Promise<{
    version: ServiceOrderItemCommercialVersion;
    fileName: string;
    absolutePath: string;
  }> {
    const { version, diagnosis } = await this.loadContext(versionId);
    if (version.status !== ServiceOrderItemCommercialVersionStatus.ISSUED) {
      throw new BadRequestException('La cotización ya no está pendiente de respuesta');
    }
    const fileName = `${version.serviceOrderItem.code}-recordatorio-cotizacion-v${version.versionNumber}.pdf`;
    const buffer = await this.buildPdf(version, diagnosis, false);
    const directory = join(process.cwd(), 'storage', 'temp', 'service-orders');
    await fs.mkdir(directory, { recursive: true });
    const absolutePath = join(directory, `reminder-${version.id}-${fileName}`);
    await fs.writeFile(absolutePath, buffer);
    return { version, fileName, absolutePath };
  }

  private async loadContext(versionId: number): Promise<{ version: ServiceOrderItemCommercialVersion; diagnosis: ServiceOrderDiagnosis }> {
    const version = await this.versionRepository.findOne({
      where: { id: versionId },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder', 'lines', 'lines.discounts'],
    });
    if (!version) throw new NotFoundException(`Commercial version with id ${versionId} not found`);
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { serviceOrderItemId: version.serviceOrderItemId, status: ServiceOrderDiagnosisStatus.CURRENT },
      order: { sequenceNumber: 'DESC' },
    });
    if (!diagnosis) throw new BadRequestException('El equipo no tiene un diagnóstico vigente para emitir la cotización');
    return { version, diagnosis };
  }

  private buildPdf(version: ServiceOrderItemCommercialVersion, diagnosis: ServiceOrderDiagnosis, draft: boolean): Promise<Buffer> {
    const item = version.serviceOrderItem;
    const order = item.serviceOrder;
    return this.pdfService.generateBuffer({
      draft,
      orderCode: order.code,
      itemCode: item.code,
      clientName: order.clientSnapshotName?.trim() || 'Cliente',
      clientDocument: [order.clientSnapshotDocumentTypeName, order.clientSnapshotDocumentNumber].filter(Boolean).join(' ') || null,
      clientPhone: order.clientSnapshotPhone,
      clientEmail: order.clientSnapshotEmail,
      equipmentLabel: this.equipmentLabel(item),
      serialNumber: item.serialNumber,
      diagnosisSummary: diagnosis.summary,
      diagnosisDetails: diagnosis.details,
      versionNumber: version.versionNumber,
      // Keep retries byte-stable by using the persisted snapshot timestamp.
      issuedAt: version.createdAt,
      notes: version.notes,
      lines: (version.lines ?? []).map((line) => ({
        type: line.type,
        // Older drafts stored generic labels such as "Servicio #1". The
        // customer-facing document uses the single business concept instead.
        name: line.type === 'SERVICE' ? 'Servicio técnico' : line.catalogNameSnapshot,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount),
        netAmount: Number(line.netAmount),
      })),
      totalAmount: Number(version.totalAmount),
    });
  }

  private equipmentLabel(item: { equipmentTypeOther?: string | null; equipmentType: string; brand?: string | null; model?: string | null }): string {
    return [item.equipmentTypeOther?.trim() || item.equipmentType, item.brand?.trim(), item.model?.trim()].filter(Boolean).join(' ');
  }
}
