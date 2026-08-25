import { promises as fs } from 'fs';
import { join } from 'path';
import { ServiceOrderFinalReportPdfService } from '../src/service-orders/documents/service-order-final-report-pdf.service';

async function main(): Promise<void> {
  const service = new ServiceOrderFinalReportPdfService();
  const buffer = await service.generateBuffer({
    orderCode: 'SO-24-08-2026-0001',
    itemCode: 'SO-24-08-2026-0001-01',
    clientName: 'Sergio Avila Rebaza',
    clientPhone: '+51 932 998 578',
    clientEmail: 'sergio@example.com',
    equipmentLabel: 'Laptop Lenovo ThinkPad',
    serialNumber: 'SN123456',
    initialIssue: 'El equipo no enciende y presenta fallas intermitentes.',
    diagnosisSummary: 'Falla en la unidad de almacenamiento.',
    diagnosisDetails:
      'Se verificaron errores de lectura en la unidad original. Después del reemplazo se realizaron pruebas de arranque, estabilidad y funcionamiento general.',
    recommendedAction: 'Reemplazo de la unidad de almacenamiento y mantenimiento preventivo.',
    completedAt: new Date('2026-08-24T10:00:00-05:00'),
    pickupPolicy: {
      freeStorageDays: 7,
      dailyStorageFee: 2,
      reminderDay: 30,
      administrativeReviewDay: 90,
      provisional: true,
    },
  });
  const outputDirectory = join(process.cwd(), 'output', 'pdf');
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, 'informe-final-servicio-ejemplo.pdf');
  await fs.writeFile(outputPath, buffer);
  process.stdout.write(outputPath);
}

void main();
