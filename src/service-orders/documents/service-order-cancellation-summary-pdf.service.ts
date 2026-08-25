import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import { ServiceOrderCancellationChannel } from '../enums';

export type CancellationSummaryPdfItem = {
  code: string;
  equipmentLabel: string;
  serialNumber: string | null;
  reason: string;
  diagnosisStarted: boolean;
  chargeAmount: number;
};

export type GenerateCancellationSummaryPdfInput = {
  orderCode: string;
  clientName: string | null;
  requestedAt: Date;
  channel: ServiceOrderCancellationChannel;
  items: CancellationSummaryPdfItem[];
};

@Injectable()
export class ServiceOrderCancellationSummaryPdfService {
  async generate(input: GenerateCancellationSummaryPdfInput) {
    const directory = join(process.cwd(), 'storage', 'temp', 'service-orders');
    await fs.mkdir(directory, { recursive: true });
    const fileName = `resumen-cancelacion-${input.orderCode}-${randomUUID()}.pdf`;
    const absolutePath = join(directory, fileName);
    await fs.writeFile(absolutePath, await this.generateBuffer(input));
    return { fileName, absolutePath, mimeType: 'application/pdf' };
  }

  async generateBuffer(input: GenerateCancellationSummaryPdfInput): Promise<Buffer> {
    const document = new PDFDocument({ margin: 44, bufferPages: true });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    const completion = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    const left = 44;
    const width = document.page.width - 88;
    document.rect(0, 0, document.page.width, 10).fill('#0E5A3C');
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(20).text('MACROCHIPS', left, 48);
    document.fillColor('#657068').font('Helvetica').fontSize(8.5)
      .text('RUC 10734740263 | Jr. Francisco Pizarro 257 | Ubigeo 130101', left, 74);
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(13)
      .text('RESUMEN DE CANCELACIÓN', left, 50, { width, align: 'right' });
    document.moveTo(left, 96).lineTo(left + width, 96).strokeColor('#D9DED9').lineWidth(0.8).stroke();

    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(8).text('ORDEN DE SERVICIO', left, 124, { characterSpacing: 1.2 });
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(20).text(input.orderCode, left, 140);
    document.roundedRect(left, 178, width, 76, 6).fill('#F5F2EA');
    const details = [
      ['CLIENTE', input.clientName?.trim() || 'Cliente'],
      ['FECHA', this.date(input.requestedAt)],
      ['CANAL', this.channel(input.channel)],
    ];
    details.forEach(([label, value], index) => {
      const x = left + 14 + index * (width / 3);
      document.fillColor('#657068').font('Helvetica-Bold').fontSize(7).text(label, x, 194);
      document.fillColor('#17211B').font('Helvetica').fontSize(9.5).text(value, x, 210, { width: width / 3 - 24 });
    });

    let y = 286;
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(13).text('Equipos cancelados', left, y);
    y += 26;
    const columns = [238, 112, width - 350];
    document.rect(left, y, width, 27).fill('#17211B');
    ['EQUIPO', 'DIAGNÓSTICO', 'IMPORTE'].forEach((header, index) => {
      const x = left + columns.slice(0, index).reduce((sum, value) => sum + value, 0);
      document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text(header, x + 9, y + 10, {
        width: columns[index] - 18,
        align: index === 2 ? 'right' : 'left',
      });
    });
    y += 27;

    input.items.forEach((item, index) => {
      const equipmentText = `${item.equipmentLabel}\n${item.code}${item.serialNumber ? ` | Serie: ${item.serialNumber}` : ''}\nMotivo: ${item.reason}`;
      const rowHeight = Math.max(56, document.font('Helvetica').fontSize(8).heightOfString(equipmentText, { width: columns[0] - 18, lineGap: 1 }) + 18);
      if (y + rowHeight > document.page.height - 92) {
        document.addPage();
        y = 54;
      }
      if (index % 2 === 1) document.rect(left, y, width, rowHeight).fill('#F7F8F6');
      document.fillColor('#17211B').font('Helvetica').fontSize(8).text(equipmentText, left + 9, y + 10, { width: columns[0] - 18, lineGap: 1 });
      document.fillColor('#39463E').font('Helvetica').fontSize(8.5)
        .text(item.diagnosisStarted ? 'Iniciado' : 'No iniciado', left + columns[0] + 9, y + 10, { width: columns[1] - 18 });
      document.fillColor(item.chargeAmount > 0 ? '#0E5A3C' : '#657068').font('Helvetica-Bold').fontSize(9)
        .text(item.chargeAmount > 0 ? this.money(item.chargeAmount) : 'Sin importe', left + columns[0] + columns[1] + 9, y + 10, {
          width: columns[2] - 18,
          align: 'right',
        });
      y += rowHeight;
    });

    const total = input.items.reduce((sum, item) => sum + Number(item.chargeAmount || 0), 0);
    y += 18;
    document.fillColor('#657068').font('Helvetica').fontSize(9).text('TOTAL PENDIENTE', left + width - 210, y + 4, { width: 105, align: 'right' });
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(15).text(this.money(total), left + width - 95, y, { width: 95, align: 'right' });

    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      document.switchToPage(page);
      const footerY = document.page.height - 64;
      document.moveTo(left, footerY).lineTo(left + width, footerY).strokeColor('#D9DED9').lineWidth(0.7).stroke();
      document.fillColor('#657068').font('Helvetica').fontSize(7.5)
        .text(`CORPORACIÓN MACROCHIPS | Página ${page + 1} de ${range.count}`, left, footerY + 7, { width, align: 'center', lineBreak: false });
    }
    document.end();
    return completion;
  }

  private money(value: number): string { return `S/ ${Number(value).toFixed(2)}`; }
  private date(value: Date): string { return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(value); }
  private channel(value: ServiceOrderCancellationChannel): string {
    return ({ WHATSAPP: 'WhatsApp', PHONE: 'Teléfono', IN_PERSON: 'Presencial', EMAIL: 'Correo electrónico', OTHER: 'Otro' } as Record<string, string>)[value] ?? value;
  }
}
