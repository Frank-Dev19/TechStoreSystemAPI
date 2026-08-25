import { ServiceOrderCancellationChannel } from '../enums';
import { ServiceOrderCancellationSummaryPdfService } from './service-order-cancellation-summary-pdf.service';

describe('ServiceOrderCancellationSummaryPdfService', () => {
  it('genera un resumen consolidado con equipos con y sin importe', async () => {
    const buffer = await new ServiceOrderCancellationSummaryPdfService().generateBuffer({
      orderCode: 'SO-24-08-2026-0001',
      clientName: 'Cliente de prueba',
      requestedAt: new Date('2026-08-24T10:30:00-05:00'),
      channel: ServiceOrderCancellationChannel.WHATSAPP,
      items: [
        { code: 'SO-24-08-2026-0001-01', equipmentLabel: 'Laptop Lenovo', serialNumber: 'SN1', reason: 'Solicitud del cliente', diagnosisStarted: true, chargeAmount: 20 },
        { code: 'SO-24-08-2026-0001-02', equipmentLabel: 'Laptop Asus', serialNumber: null, reason: 'Solicitud del cliente', diagnosisStarted: false, chargeAmount: 0 },
      ],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
