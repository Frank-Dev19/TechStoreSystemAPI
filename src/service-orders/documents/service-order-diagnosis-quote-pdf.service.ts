import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export type DiagnosisQuotePdfInput = {
  draft: boolean;
  orderCode: string;
  itemCode: string;
  clientName: string;
  clientDocument: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  equipmentLabel: string;
  serialNumber: string | null;
  diagnosisSummary: string;
  diagnosisDetails: string | null;
  versionNumber: number;
  issuedAt: Date;
  notes: string | null;
  lines: Array<{
    type: string;
    name: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    netAmount: number;
  }>;
  totalAmount: number;
};

@Injectable()
export class ServiceOrderDiagnosisQuotePdfService {
  async generateBuffer(input: DiagnosisQuotePdfInput): Promise<Buffer> {
    const document = new PDFDocument({ margin: 44, bufferPages: true });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));

    return new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      try {
        this.render(document, input);
        document.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private render(document: PDFKit.PDFDocument, input: DiagnosisQuotePdfInput): void {
    const left = 44;
    const width = document.page.width - 88;
    document.rect(left, 44, 4, 48).fill('#0E5A3C');
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(17).text('MACROCHIPS', left + 16, 48);
    document.fillColor('#657068').font('Helvetica').fontSize(7.5)
      .text('RUC 10734740263', left + 16, 70)
      .text('Jr. Francisco Pizarro 257 | Ubigeo 130101', left + 16, 81);
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(9)
      .text(input.draft ? 'VISTA PREVIA DE COTIZACIÓN' : 'DIAGNÓSTICO Y COTIZACIÓN', left + 270, 50, { width: width - 270, align: 'right', characterSpacing: 1 });
    document.fillColor('#657068').font('Helvetica').fontSize(8)
      .text(`Versión ${input.versionNumber} | ${this.formatDate(input.issuedAt)}`, left + 270, 72, { width: width - 270, align: 'right' });
    document.moveTo(left, 105).lineTo(left + width, 105).strokeColor('#D9DED9').lineWidth(0.7).stroke();

    let y = 129;
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(7.5).text('ORDEN DE SERVICIO', left, y, { characterSpacing: 1.2 });
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(19).text(input.orderCode, left, y + 15);
    if (input.draft) {
      document.save().opacity(0.08).fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(58)
        .rotate(-28, { origin: [document.page.width / 2, 390] })
        .text('BORRADOR', 90, 350, { width: 420, align: 'center' }).restore();
    }

    y += 52;
    document.rect(left, y, width, 82).fill('#F5F2EA');
    const fields = [
      ['Cliente', input.clientName], ['Documento', input.clientDocument || 'No especificado'], ['Teléfono', input.clientPhone || 'No especificado'],
      ['Equipo', input.equipmentLabel], ['Código / serie', `${input.itemCode} | ${input.serialNumber || 'Sin serie'}`], ['Correo', input.clientEmail || 'No especificado'],
    ];
    const columnWidth = width / 3;
    fields.forEach(([label, value], index) => {
      const x = left + (index % 3) * columnWidth + 13;
      const fy = y + 12 + Math.floor(index / 3) * 38;
      document.fillColor('#657068').font('Helvetica-Bold').fontSize(6.8).text(label.toUpperCase(), x, fy, { width: columnWidth - 26, characterSpacing: 0.5 });
      document.fillColor('#17211B').font('Helvetica').fontSize(9).text(value, x, fy + 12, { width: columnWidth - 26, ellipsis: true });
    });

    y += 108;
    y = this.drawSection(document, 'Diagnóstico', input.diagnosisSummary, input.diagnosisDetails, left, y, width);
    y += 18;
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(13).text('Detalle de la cotización', left, y);
    y += 26;
    document.rect(left, y, width, 25).fill('#17211B');
    const cols = [250, 55, 75, width - 380];
    const headers = ['CONCEPTO', 'CANT.', 'P. UNIT.', 'IMPORTE'];
    let x = left;
    headers.forEach((header, index) => {
      document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text(header, x + 8, y + 9, { width: cols[index] - 16, align: index > 1 ? 'right' : 'left' });
      x += cols[index];
    });
    y += 25;
    input.lines.forEach((line, index) => {
      const rowHeight = 34;
      if (y + rowHeight > document.page.height - 92) {
        document.addPage();
        y = 54;
      }
      if (index % 2) document.rect(left, y, width, rowHeight).fill('#F7F8F6');
      x = left;
      const values = [
        line.name,
        line.type === 'SERVICE' ? '-' : this.number(line.quantity),
        this.money(line.unitPrice),
        this.money(line.netAmount),
      ];
      values.forEach((value, column) => {
        document.fillColor('#17211B').font(column === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
          .text(value, x + 8, y + 11, { width: cols[column] - 16, align: column > 1 ? 'right' : 'left' });
        x += cols[column];
      });
      y += rowHeight;
    });
    y += 14;
    document.fillColor('#657068').font('Helvetica').fontSize(8.5).text('TOTAL', left + width - 190, y + 5, { width: 80, align: 'right' });
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(15).text(this.money(input.totalAmount), left + width - 100, y, { width: 100, align: 'right' });
    if (input.notes?.trim()) {
      y += 38;
      document.fillColor('#657068').font('Helvetica-Bold').fontSize(7).text('OBSERVACIONES', left, y, { characterSpacing: 0.6 });
      document.fillColor('#17211B').font('Helvetica').fontSize(8.8).text(input.notes.trim(), left, y + 13, { width });
      y += 13 + document.heightOfString(input.notes.trim(), { width, lineGap: 2 });
    }

    const cancellationText =
      'Si solicitas cancelar la atención después de iniciado el diagnóstico, corresponde un cargo de S/ 20.00 por el servicio de diagnóstico realizado.';
    y += 24;
    const cancellationHeight = 52;
    if (y + cancellationHeight > document.page.height - 76) {
      document.addPage();
      y = 54;
    }
    document.roundedRect(left, y, width, cancellationHeight, 6).fill('#F4F7F4');
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(7.2)
      .text('CONDICIÓN DE CANCELACIÓN', left + 12, y + 11, { characterSpacing: 0.5 });
    document.fillColor('#39463E').font('Helvetica').fontSize(8.2)
      .text(cancellationText, left + 12, y + 25, { width: width - 24, lineGap: 1.5 });
    this.drawFooters(document);
  }

  private drawSection(document: PDFKit.PDFDocument, title: string, summary: string, details: string | null, x: number, y: number, width: number): number {
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(13).text(title, x, y);
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(10).text(summary, x, y + 24, { width });
    document.fillColor('#657068').font('Helvetica').fontSize(8.8).text(details || 'Sin detalles adicionales.', x, y + 42, { width, lineGap: 2 });
    return y + 42 + document.heightOfString(details || 'Sin detalles adicionales.', { width, lineGap: 2 });
  }

  private drawFooters(document: PDFKit.PDFDocument): void {
    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      document.switchToPage(page);
      const y = document.page.height - 56;
      document.moveTo(44, y).lineTo(document.page.width - 44, y).strokeColor('#D9DED9').lineWidth(0.7).stroke();
      document.fillColor('#657068').font('Helvetica').fontSize(7.5)
        .text(`CORPORACIÓN MACROCHIPS | Página ${page - range.start + 1} de ${range.count}`, 44, y + 2, {
          width: document.page.width - 88,
          align: 'center',
          lineBreak: false,
        });
    }
  }

  private money(value: number): string { return `S/ ${Number(value || 0).toFixed(2)}`; }
  private number(value: number): string { return Number(value || 0).toFixed(Number.isInteger(Number(value)) ? 0 : 2); }
  private formatDate(value: Date): string { return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(value); }
}
