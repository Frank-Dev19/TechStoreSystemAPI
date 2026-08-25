import { BadRequestException } from '@nestjs/common';
import { MailerService } from '../../mailer/mailer.service';
import { ServiceOrderService } from './service-order.service';
import { ServiceOrderSummaryEmailService } from './service-order-summary-email.service';

describe('ServiceOrderSummaryEmailService', () => {
  const serviceOrderService = {
    findOne: jest.fn(),
    generateSingleOrderSummaryPdf: jest.fn(),
  } as unknown as jest.Mocked<ServiceOrderService>;
  const mailerService = {
    escapeHtml: jest.fn((value: string) => value),
    sendMail: jest.fn(),
  } as unknown as jest.Mocked<MailerService>;
  const service = new ServiceOrderSummaryEmailService(serviceOrderService, mailerService);

  beforeEach(() => jest.clearAllMocks());

  it('emails the current summary PDF to the registered order email', async () => {
    serviceOrderService.findOne.mockResolvedValue({
      id: 7,
      code: 'SO-2026-0007',
      clientSnapshotName: 'Ana Cliente',
      clientSnapshotEmail: 'ana@example.com',
      client: null,
    } as any);
    serviceOrderService.generateSingleOrderSummaryPdf.mockResolvedValue({
      fileName: 'SO-2026-0007-resumen.pdf',
      buffer: Buffer.from('%PDF-test'),
      mimeType: 'application/pdf',
    });

    await expect(service.send(7, undefined, {
      sub: 10,
      roles: [{ id: 2, name: 'recepcionist' }],
    })).resolves.toEqual({
      ok: true,
      serviceOrderId: 7,
      to: 'ana@example.com',
      message: 'Resumen de la orden enviado por correo.',
    });
    expect(mailerService.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ana@example.com',
      attachments: [expect.objectContaining({ filename: 'SO-2026-0007-resumen.pdf' })],
    }));
  });

  it('rejects delivery when the order has no registered email', async () => {
    serviceOrderService.findOne.mockResolvedValue({
      id: 8,
      code: 'SO-2026-0008',
      clientSnapshotEmail: null,
      client: { email: null },
    } as any);

    await expect(service.send(8)).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceOrderService.generateSingleOrderSummaryPdf).not.toHaveBeenCalled();
    expect(mailerService.sendMail).not.toHaveBeenCalled();
  });

  it('uses a one-time recipient when the order has no registered email', async () => {
    serviceOrderService.findOne.mockResolvedValue({
      id: 9,
      code: 'SO-2026-0009',
      clientSnapshotName: 'Cliente sin correo',
      clientSnapshotEmail: null,
      client: null,
    } as any);
    serviceOrderService.generateSingleOrderSummaryPdf.mockResolvedValue({
      fileName: 'SO-2026-0009-resumen.pdf',
      buffer: Buffer.from('%PDF-test'),
      mimeType: 'application/pdf',
    });

    await service.send(9, 'temporal@example.com');

    expect(mailerService.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'temporal@example.com',
    }));
  });
});
