import { ServiceOrderDiagnosisQuotePdfService } from './service-order-diagnosis-quote-pdf.service';

describe('ServiceOrderDiagnosisQuotePdfService', () => {
  it('genera el PDF consolidado de diagnóstico y cotización', async () => {
    const buffer = await new ServiceOrderDiagnosisQuotePdfService().generateBuffer({
      draft: true,
      orderCode: 'SO-22-08-2026-0001',
      itemCode: 'SO-22-08-2026-0001-01',
      clientName: 'Cliente de prueba',
      clientDocument: 'DNI 12345678',
      clientPhone: '+51 999 999 999',
      clientEmail: 'cliente@example.com',
      equipmentLabel: 'Laptop Lenovo ThinkPad',
      serialNumber: 'SN123456',
      diagnosisSummary: 'Falla de almacenamiento',
      diagnosisDetails: 'La unidad presenta errores de lectura.',
      versionNumber: 1,
      issuedAt: new Date('2026-08-22T12:00:00-05:00'),
      notes: null,
      lines: [
        { type: 'SERVICE', name: 'Servicio técnico', quantity: 1, unitPrice: 20, discountAmount: 0, netAmount: 20 },
        { type: 'PRODUCT', name: 'Unidad SSD', quantity: 1, unitPrice: 180, discountAmount: 0, netAmount: 180 },
      ],
      totalAmount: 200,
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
