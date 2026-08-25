import { ServiceOrderFinalReportPdfService } from './service-order-final-report-pdf.service';

describe('ServiceOrderFinalReportPdfService', () => {
  it('genera un informe final individual con condiciones provisionales', async () => {
    const buffer = await new ServiceOrderFinalReportPdfService().generateBuffer({
      orderCode: 'SO-24-08-2026-0001',
      itemCode: 'SO-24-08-2026-0001-01',
      clientName: 'Cliente de muestra',
      clientPhone: '+51 999 999 999',
      clientEmail: 'cliente@example.com',
      equipmentLabel: 'Laptop Lenovo ThinkPad',
      serialNumber: 'SN123456',
      initialIssue: 'No enciende',
      diagnosisSummary: 'Falla en la unidad de almacenamiento',
      diagnosisDetails: 'La unidad presentaba errores de lectura.',
      recommendedAction: 'Reemplazo de la unidad y pruebas de funcionamiento.',
      completedAt: new Date('2026-08-24T10:00:00-05:00'),
      pickupPolicy: {
        freeStorageDays: 7,
        dailyStorageFee: 2,
        reminderDay: 30,
        administrativeReviewDay: 90,
        provisional: true,
      },
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
