import { ConfigService } from '@nestjs/config';
import { ServiceOrderIntakePdfService } from '../documents/service-order-intake-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { EquipmentType, ServiceOrderOperativeStatus, ServiceOrderPriority, ServiceType } from '../enums';
import { ServiceOrderIntakeNotificationService } from './service-order-intake-notification.service';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

describe('ServiceOrderIntakeNotificationService', () => {
  const pdfService = {
    generateSingleOrderSummary: jest.fn(),
  } as unknown as jest.Mocked<ServiceOrderIntakePdfService>;
  const tempDocumentsService = {
    createRecord: jest.fn(),
  } as unknown as jest.Mocked<ServiceOrderTempDocumentsService>;
  const messageMatrixService = {
    dispatchOrderIntakeTemplate: jest.fn(),
  } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'APP_PUBLIC_BASE_URL') return 'https://subdominio.macrochips.com/api';
      if (key === 'WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME') return 'resumen_de_orden_de_servicio';
      return undefined;
    }),
  } as unknown as jest.Mocked<ConfigService>;

  const items = [
    {
      id: 11,
      position: 1,
      code: 'SO-25-08-2026-0001-01',
      equipmentType: EquipmentType.LAPTOP,
      brand: 'Lenovo',
      model: 'ThinkPad',
      priority: ServiceOrderPriority.LOW,
      initialIssue: 'No enciende',
    },
    {
      id: 12,
      position: 2,
      code: 'SO-25-08-2026-0001-02',
      equipmentType: EquipmentType.PRINTER,
      brand: 'Epson',
      model: 'L4260',
      priority: ServiceOrderPriority.MEDIUM,
      initialIssue: 'No imprime',
    },
  ] as ServiceOrderItem[];
  const order = {
    id: 8,
    code: 'SO-25-08-2026-0001',
    serviceType: ServiceType.DIAGNOSIS,
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    clientSnapshotName: 'Sergio',
    clientSnapshotPhone: '+51932998578',
    createdAt: new Date('2026-08-25T15:26:29.000Z'),
    items,
  } as ServiceOrder;

  beforeEach(() => {
    jest.clearAllMocks();
    pdfService.generateSingleOrderSummary.mockResolvedValue({
      fileName: 'SO-25-08-2026-0001-resumen.pdf',
      absolutePath: 'C:/tmp/SO-25-08-2026-0001-resumen.pdf',
      mimeType: 'application/pdf',
    });
    tempDocumentsService.createRecord.mockResolvedValue({ token: 'document-token' } as any);
    messageMatrixService.dispatchOrderIntakeTemplate.mockResolvedValue();
  });

  it('genera el PDF completo y despacha una plantilla por orden confirmada', async () => {
    const service = new ServiceOrderIntakeNotificationService(
      pdfService,
      tempDocumentsService,
      messageMatrixService,
      configService,
    );

    await service.notifyOrders([order]);

    expect(pdfService.generateSingleOrderSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SO-25-08-2026-0001',
        clientName: 'Sergio',
        items: [
          expect.objectContaining({ code: 'SO-25-08-2026-0001-01', brand: 'Lenovo' }),
          expect.objectContaining({ code: 'SO-25-08-2026-0001-02', brand: 'Epson' }),
        ],
      }),
    );
    expect(messageMatrixService.dispatchOrderIntakeTemplate).toHaveBeenCalledWith({
      serviceOrders: [order],
      equipmentCount: '2 equipos',
      documentUrl: 'https://subdominio.macrochips.com/api/service-orders/temp-documents/document-token',
      documentFileName: 'SO-25-08-2026-0001-resumen.pdf',
      tempDocumentToken: 'document-token',
    });
  });

  it('no revierte el alta si falla la preparación externa', async () => {
    pdfService.generateSingleOrderSummary.mockRejectedValueOnce(new Error('storage unavailable'));
    const service = new ServiceOrderIntakeNotificationService(
      pdfService,
      tempDocumentsService,
      messageMatrixService,
      configService,
    );

    await expect(service.notifyOrders([order])).resolves.toBeUndefined();
    expect(messageMatrixService.dispatchOrderIntakeTemplate).not.toHaveBeenCalled();
  });
});
