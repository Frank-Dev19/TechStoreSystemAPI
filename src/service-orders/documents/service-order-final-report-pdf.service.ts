import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';

export type ServiceOrderPickupPolicy = {
  freeStorageDays: number;
  dailyStorageFee: number;
  reminderDay: number;
  administrativeReviewDay: number;
  provisional: boolean;
};

export type ServiceOrderFinalReportPdfInput = {
  orderCode: string;
  itemCode: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  equipmentLabel: string;
  serialNumber: string | null;
  initialIssue: string;
  diagnosisSummary: string | null;
  diagnosisDetails: string | null;
  recommendedAction: string | null;
  completedAt: Date;
  pickupPolicy: ServiceOrderPickupPolicy;
};

@Injectable()
export class ServiceOrderFinalReportPdfService {
  async generate(input: ServiceOrderFinalReportPdfInput) {
    const directory = join(process.cwd(), 'storage', 'temp', 'service-orders');
    await fs.mkdir(directory, { recursive: true });
    const fileName = `${input.itemCode}-informe-final-${randomUUID()}.pdf`;
    const absolutePath = join(directory, fileName);
    await fs.writeFile(absolutePath, await this.generateBuffer(input));
    return { fileName, absolutePath, mimeType: 'application/pdf' };
  }

  async generateBuffer(input: ServiceOrderFinalReportPdfInput): Promise<Buffer> {
    const document = new PDFDocument({ margin: 44, bufferPages: true, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    const completion = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    const left = 44;
    const width = document.page.width - 88;
    document.rect(0, 0, document.page.width, 10).fill('#0E5A3C');
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(20).text('MACROCHIPS', left, 44);
    document
      .fillColor('#657068')
      .font('Helvetica')
      .fontSize(8.5)
      .text('RUC 10734740263 | Jr. Francisco Pizarro 257 | Ubigeo 130101', left, 70);
    document
      .fillColor('#17211B')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('INFORME FINAL DEL SERVICIO', left, 47, { width, align: 'right' });
    document.moveTo(left, 94).lineTo(left + width, 94).strokeColor('#D9DED9').lineWidth(0.8).stroke();

    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(8).text('EQUIPO ATENDIDO', left, 118, {
      characterSpacing: 1.1,
    });
    document.fillColor('#17211B').font('Helvetica-Bold').fontSize(18).text(input.equipmentLabel, left, 134);
    document.fillColor('#657068').font('Helvetica').fontSize(9).text(input.itemCode, left, 158);

    const infoTop = 184;
    document.roundedRect(left, infoTop, width, 82, 6).fill('#F5F2EA');
    this.labelValue(document, 'ORDEN', input.orderCode, left + 14, infoTop + 15, 158);
    this.labelValue(document, 'CLIENTE', input.clientName, left + 180, infoTop + 15, 178);
    this.labelValue(document, 'FINALIZACIÓN', this.date(input.completedAt), left + 372, infoTop + 15, 135);
    this.labelValue(document, 'SERIE', input.serialNumber || 'No registrada', left + 14, infoTop + 49, 158);
    this.labelValue(document, 'CONTACTO', input.clientPhone || 'No registrado', left + 180, infoTop + 49, 178);
    this.labelValue(document, 'CORREO', input.clientEmail || 'No registrado', left + 372, infoTop + 49, 135);

    let y = 294;
    y = this.section(document, 'Problema reportado', input.initialIssue, left, y, width);
    y = this.section(
      document,
      'Resultado técnico',
      input.diagnosisSummary || 'Servicio técnico finalizado.',
      left,
      y,
      width,
    );
    if (input.diagnosisDetails) {
      y = this.section(document, 'Detalle del diagnóstico', input.diagnosisDetails, left, y, width);
    }
    if (input.recommendedAction) {
      y = this.section(document, 'Acción técnica indicada', input.recommendedAction, left, y, width);
    }

    y += 4;
    const policyHeight = 142;
    if (y + policyHeight > document.page.height - 84) {
      document.addPage();
      y = 54;
    }
    document.roundedRect(left, y, width, policyHeight, 7).fillAndStroke('#F8F4E8', '#E4D3A2');
    document.fillColor('#725117').font('Helvetica-Bold').fontSize(11).text('Condiciones de recojo', left + 14, y + 14);
    const policyText = [
      `El equipo puede recogerse sin cargo de almacenamiento durante ${input.pickupPolicy.freeStorageDays} días calendario desde esta comunicación.`,
      `Desde el día ${input.pickupPolicy.freeStorageDays + 1}, se considera un cargo referencial de ${this.money(input.pickupPolicy.dailyStorageFee)} por cada día adicional.`,
      `A los ${input.pickupPolicy.reminderDay} días se enviará una nueva comunicación para coordinar el recojo y regularizar importes pendientes.`,
      `A los ${input.pickupPolicy.administrativeReviewDay} días sin respuesta, el caso será evaluado administrativamente. La propiedad del equipo no se transfiere automáticamente.`,
    ];
    document
      .fillColor('#4D452F')
      .font('Helvetica')
      .fontSize(8.3)
      .text(policyText.map((line) => `- ${line}`).join('\n'), left + 14, y + 36, {
        width: width - 28,
        lineGap: 3,
      });
    if (input.pickupPolicy.provisional) {
      document
        .fillColor('#8A611B')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text('CONDICIONES Y VALORES REFERENCIALES SUJETOS A CONFIRMACIÓN COMERCIAL.', left + 14, y + 120, {
          width: width - 28,
        });
    }

    const range = document.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      document.switchToPage(page);
      const footerY = document.page.height - 72;
      document.moveTo(left, footerY).lineTo(left + width, footerY).strokeColor('#D9DED9').lineWidth(0.7).stroke();
      document
        .fillColor('#657068')
        .font('Helvetica')
        .fontSize(7.5)
        .text(`CORPORACIÓN MACROCHIPS | Página ${page + 1} de ${range.count}`, left, footerY + 8, {
          width,
          align: 'center',
          lineBreak: false,
        });
    }

    document.end();
    return completion;
  }

  private labelValue(
    document: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
  ): void {
    document.fillColor('#657068').font('Helvetica-Bold').fontSize(6.8).text(label, x, y, { width });
    document.fillColor('#17211B').font('Helvetica').fontSize(8.7).text(value, x, y + 12, { width });
  }

  private section(
    document: PDFKit.PDFDocument,
    title: string,
    text: string,
    x: number,
    y: number,
    width: number,
  ): number {
    document.fillColor('#0E5A3C').font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), x, y, {
      characterSpacing: 0.7,
    });
    const textTop = y + 17;
    document.fillColor('#26322B').font('Helvetica').fontSize(9).text(text, x, textTop, {
      width,
      lineGap: 2,
    });
    const height = document.heightOfString(text, { width, lineGap: 2 });
    return textTop + height + 18;
  }

  private date(value: Date): string {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(value);
  }

  private money(value: number): string {
    return `S/ ${Number(value).toFixed(2)}`;
  }
}
