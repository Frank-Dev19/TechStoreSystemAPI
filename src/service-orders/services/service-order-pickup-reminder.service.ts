import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ServiceOrderPickupReminderPdfService } from '../documents/service-order-pickup-reminder-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { PrivateFileStorageService } from '../storage/private-file-storage.service';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

@Injectable()
export class ServiceOrderPickupReminderService {
  private readonly logger = new Logger(ServiceOrderPickupReminderService.name);

  constructor(
    @InjectRepository(ServiceOrder) private readonly orderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderItem) private readonly itemRepository: Repository<ServiceOrderItem>,
    private readonly pdfService: ServiceOrderPickupReminderPdfService,
    private readonly privateStorage: PrivateFileStorageService,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(process.env.SERVICE_ORDER_NOTIFICATION_SCHEDULER_CRON || '0 */15 * * * *')
  async dispatchAutomaticReminders(): Promise<void> {
    const hours = this.positiveNumber('SERVICE_ORDER_PICKUP_REMINDER_HOURS', 48);
    const orders = await this.orderRepository.find({ relations: ['items'], take: 250, order: { updatedAt: 'ASC' } });
    const threshold = Date.now() - hours * 3_600_000;
    for (const order of orders) {
      const outstanding = (order.items ?? []).filter((item) => !item.deliveredAt);
      if (!outstanding.length || !outstanding.every((item) => this.availabilityDate(item))) continue;
      const latestAvailability = Math.max(...outstanding.map((item) => this.availabilityDate(item)!.getTime()));
      if (latestAvailability > threshold) continue;
      try {
        await this.send(order, outstanding, true);
      } catch (error) {
        this.logger.error(`No se pudo preparar el recordatorio de recojo de la orden ${order.id}: ${(error as Error).message}`);
      }
    }
  }

  async sendManual(serviceOrderId: number, itemIds: number[]): Promise<{ ok: true; itemIds: number[] }> {
    const normalizedIds = [...new Set(itemIds.map(Number))];
    const [order, items] = await Promise.all([
      this.orderRepository.findOne({ where: { id: serviceOrderId } }),
      this.itemRepository.find({ where: { id: In(normalizedIds), serviceOrderId } }),
    ]);
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (items.length !== normalizedIds.length) throw new BadRequestException('Uno o más equipos no pertenecen a la orden');
    if (items.some((item) => item.deliveredAt || !this.availabilityDate(item))) {
      throw new BadRequestException('Solo se puede recordar el recojo de equipos disponibles y aún no entregados');
    }
    await this.send(order, items, false);
    return { ok: true, itemIds: normalizedIds };
  }

  private async send(order: ServiceOrder, items: ServiceOrderItem[], automatic: boolean): Promise<void> {
    const sortedItemIds = items.map((item) => Number(item.id)).sort((a, b) => a - b);
    const suffix = automatic ? 'automatic' : `manual:${sortedItemIds.join('-')}`;
    if (await this.messageMatrixService.hasNotification(`service_order:${order.id}:pickup-reminder:${suffix}`)) return;
    const buffer = await this.pdfService.generate({
      orderCode: order.code,
      clientName: order.clientSnapshotName?.trim() || 'Cliente',
      items: items.map((item) => ({
        code: item.code,
        equipment: [item.equipmentTypeOther || item.equipmentType, item.brand, item.model].filter(Boolean).join(' '),
        serialNumber: item.serialNumber,
        availabilityDate: this.availabilityDate(item)!,
      })),
    });
    const fileName = `${order.code}-recordatorio-recojo.pdf`;
    const stored = await this.privateStorage.store('service-orders', ['pickup-reminders', String(order.id)], fileName, buffer);
    const tempDocument = await this.tempDocumentsService.createRecord({
      sourceType: 'PICKUP_REMINDER', mimeType: 'application/pdf', fileName,
      absolutePath: stored.absolutePath,
      metadata: { serviceOrderId: order.id, itemIds: items.map((item) => item.id), automatic },
    });
    const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(/\/+$/, '');
    await this.messageMatrixService.dispatchPickupReminderTemplate({
      serviceOrder: order,
      itemIds: items.map((item) => item.id),
      equipmentSummary: items.length === 1 ? this.equipmentLabel(items[0]) : `${items.length} equipos`,
      documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
      documentFileName: fileName,
      tempDocumentToken: tempDocument.token,
      automatic,
    });
  }

  private availabilityDate(item: ServiceOrderItem): Date | null {
    return item.readyForPickupAt ?? item.cancelledAt ?? null;
  }

  private equipmentLabel(item: ServiceOrderItem): string {
    return [item.equipmentTypeOther || item.equipmentType, item.brand, item.model].filter(Boolean).join(' ');
  }

  private positiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
