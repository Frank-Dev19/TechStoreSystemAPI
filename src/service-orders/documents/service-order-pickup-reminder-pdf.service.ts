import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export type PickupReminderPdfItem = {
  code: string;
  equipment: string;
  serialNumber?: string | null;
  availabilityDate: Date;
};

@Injectable()
export class ServiceOrderPickupReminderPdfService {
  generate(input: { orderCode: string; clientName: string; items: PickupReminderPdfItem[] }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 46, info: { Title: `Recordatorio de recojo ${input.orderCode}` } });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));

      document.fillColor('#123524').font('Helvetica-Bold').fontSize(10).text('MACROCHIPS');
      document.fillColor('#64748b').font('Helvetica').fontSize(8).text('Servicio técnico');
      document.moveDown(1.2);
      document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text('Recordatorio de recojo');
      document.moveDown(0.35);
      document.fillColor('#475569').font('Helvetica').fontSize(10)
        .text(`Orden ${input.orderCode} · Cliente: ${input.clientName}`);
      document.moveDown(1.2);
      document.fillColor('#0f172a').font('Helvetica').fontSize(10)
        .text('Los siguientes equipos están disponibles para ser recogidos en nuestro local.');
      document.moveDown(1);

      const x = 46;
      const widths = [120, 240, 100];
      const headers = ['CÓDIGO', 'EQUIPO', 'DISPONIBLE DESDE'];
      const headerY = document.y;
      document.rect(x, headerY, widths.reduce((a, b) => a + b, 0), 24).fill('#123524');
      let cursor = x;
      headers.forEach((header, index) => {
        document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(header, cursor + 8, headerY + 8, { width: widths[index] - 16 });
        cursor += widths[index];
      });
      let y = headerY + 24;
      input.items.forEach((item, index) => {
        if (y > 730) { document.addPage(); y = 46; }
        document.rect(x, y, widths.reduce((a, b) => a + b, 0), 38).fill(index % 2 ? '#f8fafc' : '#ffffff');
        cursor = x;
        const values = [item.code, `${item.equipment}${item.serialNumber ? `\nSerie: ${item.serialNumber}` : ''}`, this.formatDate(item.availabilityDate)];
        values.forEach((value, column) => {
          document.fillColor('#1e293b').font(column === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
            .text(value, cursor + 8, y + 9, { width: widths[column] - 16 });
          cursor += widths[column];
        });
        y += 38;
      });
      document.y = y + 18;
      document.fillColor('#475569').font('Helvetica').fontSize(9)
        .text('Si necesitas coordinar el recojo o tienes una consulta, responde al mensaje de WhatsApp recibido.');
      document.end();
    });
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(value);
  }
}
