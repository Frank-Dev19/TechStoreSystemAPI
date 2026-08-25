import { BadRequestException } from '@nestjs/common';
import { ServiceOrderPickupReminderService } from './service-order-pickup-reminder.service';

describe('ServiceOrderPickupReminderService', () => {
  const order = { id: 7, code: 'SO-7', clientSnapshotName: 'Sergio', items: [] } as any;
  const item = {
    id: 71, serviceOrderId: 7, code: 'SO-7-01', equipmentType: 'LAPTOP', brand: 'Lenovo', model: 'X1',
    serialNumber: 'SN1', readyForPickupAt: new Date('2026-08-20T10:00:00Z'), cancelledAt: null, deliveredAt: null,
  } as any;

  const createService = (overrides: { items?: any[] } = {}) => {
    const items = overrides.items ?? [item];
    const orderRepository = { findOne: jest.fn().mockResolvedValue(order), find: jest.fn() };
    const itemRepository = { find: jest.fn().mockResolvedValue(items) };
    const pdfService = { generate: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    const privateStorage = { store: jest.fn().mockResolvedValue({ absolutePath: 'C:/storage/pickup.pdf' }) };
    const tempDocuments = { createRecord: jest.fn().mockResolvedValue({ token: 'temp-token' }) };
    const messageMatrix = {
      hasNotification: jest.fn().mockResolvedValue(false),
      dispatchPickupReminderTemplate: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn((key: string) => key === 'APP_PUBLIC_BASE_URL' ? 'https://example.com/api' : undefined) };
    const service = new ServiceOrderPickupReminderService(
      orderRepository as any, itemRepository as any, pdfService as any, privateStorage as any,
      tempDocuments as any, messageMatrix as any, config as any,
    );
    return { service, messageMatrix };
  };

  it('envía un solo recordatorio manual para el equipo disponible', async () => {
    const { service, messageMatrix } = createService();
    await expect(service.sendManual(7, [71])).resolves.toEqual({ ok: true, itemIds: [71] });
    expect(messageMatrix.dispatchPickupReminderTemplate).toHaveBeenCalledWith(expect.objectContaining({
      itemIds: [71], automatic: false, documentUrl: 'https://example.com/api/service-orders/temp-documents/temp-token',
    }));
  });

  it('rechaza el recordatorio cuando el equipo ya fue entregado', async () => {
    const { service } = createService({ items: [{ ...item, deliveredAt: new Date() }] });
    await expect(service.sendManual(7, [71])).rejects.toBeInstanceOf(BadRequestException);
  });
});
