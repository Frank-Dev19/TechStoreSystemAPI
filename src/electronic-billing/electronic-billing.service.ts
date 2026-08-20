import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { ApisPeruDocumentResponse, ApisPeruInvoicePayload } from './dto/apisperu-invoice.types';
import { ElectronicDocument } from './entities/electronic-document.entity';
import { ElectronicDocumentStatus } from './enums/electronic-document-status.enum';
import { mapSaleToApisPeruInvoicePayload } from './mappers/sale-to-apisperu-invoice.mapper';
import { ApisPeruBillingClient } from './services/apisperu-billing.client';
import { MailerService } from '../mailer/mailer.service';
import { SendElectronicDocumentEmailDto } from './dto/send-electronic-document-email.dto';
import { MailPurpose } from '../mail-settings/enums/mail-purpose.enum';

@Injectable()
export class ElectronicBillingService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(ElectronicDocument)
    private readonly electronicDocumentRepo: Repository<ElectronicDocument>,
    private readonly businessProfileService: BusinessProfileService,
    private readonly apisPeruClient: ApisPeruBillingClient,
    private readonly mailerService: MailerService,
  ) {}

  async buildInvoicePayload(saleId: number): Promise<ApisPeruInvoicePayload> {
    const sale = await this.findSaleForBilling(saleId);
    const company = await this.businessProfileService.getInvoiceCompanyPayload();
    return mapSaleToApisPeruInvoicePayload(sale, company);
  }

  async sendInvoice(saleId: number): Promise<{
    saleId: number;
    payload: ApisPeruInvoicePayload;
    document: ElectronicDocument;
    response: ApisPeruDocumentResponse;
  }> {
    const sale = await this.findSaleForBilling(saleId);
    const company = await this.businessProfileService.getInvoiceCompanyPayload();
    const payload = mapSaleToApisPeruInvoicePayload(sale, company);
    const document = await this.createPendingDocument(sale, payload);

    try {
      const response = await this.apisPeruClient.sendInvoice(payload);
      const savedDocument = await this.markDocumentWithResponse(document, response);

      return {
        saleId,
        payload,
        document: savedDocument,
        response,
      };
    } catch (error) {
      await this.markDocumentWithError(document, error);
      throw error;
    }
  }

  async findBySale(saleId: number): Promise<ElectronicDocument> {
    const document = await this.electronicDocumentRepo.findOne({
      where: { saleId },
      order: { id: 'DESC' },
    });

    if (!document) {
      throw new NotFoundException(`La venta ${saleId} no tiene documento electronico registrado.`);
    }

    return document;
  }

  async getInvoiceXmlFile(saleId: number): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const document = await this.findBySale(saleId);
    if (!document.xml) {
      throw new NotFoundException('El comprobante electronico no tiene XML registrado.');
    }

    return {
      buffer: Buffer.from(document.xml, 'utf8'),
      filename: `${this.buildDocumentFileName(document)}.xml`,
      contentType: 'application/xml; charset=utf-8',
    };
  }

  async getInvoiceCdrFile(saleId: number): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const document = await this.findBySale(saleId);
    if (!document.cdrZip) {
      throw new NotFoundException('El comprobante electronico no tiene CDR registrado.');
    }

    return {
      buffer: Buffer.from(document.cdrZip, 'base64'),
      filename: `R-${this.buildDocumentFileName(document)}.zip`,
      contentType: 'application/zip',
    };
  }

  async getInvoicePdfFile(saleId: number): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const document = await this.findBySale(saleId);
    if (document.status !== ElectronicDocumentStatus.ACCEPTED) {
      throw new BadRequestException('Primero debe emitir y aceptar el comprobante electronico ante SUNAT.');
    }

    const payload = this.isInvoicePayload(document.payloadJson)
      ? document.payloadJson
      : await this.buildInvoicePayload(saleId);

    const buffer = await this.apisPeruClient.generateInvoicePdf(payload);

    return {
      buffer,
      filename: `${this.buildDocumentFileName(document)}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async emailInvoice(
    saleId: number,
    dto: SendElectronicDocumentEmailDto = {},
  ): Promise<{ ok: true; saleId: number; to: string; message: string }> {
    const sale = await this.findSaleForBilling(saleId);
    const document = await this.findBySale(saleId);

    if (document.status !== ElectronicDocumentStatus.ACCEPTED) {
      throw new BadRequestException('Primero debe emitir y aceptar el comprobante electronico ante SUNAT.');
    }

    const to = this.resolveRecipientEmail(dto.to, sale);
    if (!to) {
      throw new BadRequestException('El cliente no tiene correo registrado. Agregue un correo al cliente o envie uno en la solicitud.');
    }

    const pdf = await this.getInvoicePdfFile(saleId);
    const xml = await this.getInvoiceXmlFile(saleId);
    const attachments = [
      { filename: pdf.filename, content: pdf.buffer, contentType: pdf.contentType },
      { filename: xml.filename, content: xml.buffer, contentType: xml.contentType },
    ];

    if (document.cdrZip) {
      const cdr = await this.getInvoiceCdrFile(saleId);
      attachments.push({ filename: cdr.filename, content: cdr.buffer, contentType: cdr.contentType });
    }

    const documentLabel = `${document.series}-${document.number}`;
    const customerName = sale.billingSnapshotName || sale.customer?.name || 'cliente';
    const total = this.formatMoney(sale.total);
    const customMessage = dto.message?.trim();
    const message = await this.mailerService.prepareMessage(
      MailPurpose.ELECTRONIC_BILLING,
      {
        subject: 'Comprobante electrónico {documento}',
        intro: 'Adjuntamos su comprobante electrónico emitido por Macrochips.',
        footer: 'Gracias por confiar en Macrochips.',
      },
      { documento: documentLabel },
    );

    await this.mailerService.sendMail({
      to,
      subject: message.subject,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <h2 style="margin-bottom:8px">${message.subjectHtml}</h2>
          <p>Hola ${this.mailerService.escapeHtml(customerName)},</p>
          <p>${message.introHtml}</p>
          <p><strong>Documento:</strong> ${this.mailerService.escapeHtml(documentLabel)}</p>
          <p><strong>Total:</strong> S/ ${total}</p>
          ${customMessage ? `<p>${this.mailerService.escapeHtml(customMessage)}</p>` : ''}
          <p>Se adjunta el PDF y XML del comprobante${document.cdrZip ? ', junto con el CDR de SUNAT' : ''}.</p>
          <p>${message.footerHtml}</p>
        </div>
      `,
      text: `Comprobante electronico ${documentLabel}. Total: S/ ${total}.`,
      attachments,
      purpose: MailPurpose.ELECTRONIC_BILLING,
    });

    return {
      ok: true,
      saleId,
      to,
      message: 'Comprobante electronico enviado por correo.',
    };
  }

  private async findSaleForBilling(saleId: number): Promise<Sale> {
    const sale = await this.saleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('customer.documentType', 'customerDocumentType')
      .leftJoinAndSelect('sale.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.baseUnit', 'productBaseUnit')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.id = :saleId', { saleId })
      .getOne();

    if (!sale) {
      throw new NotFoundException(`Venta ${saleId} no encontrada.`);
    }

    if (sale.status !== SaleStatus.CONFIRMED) {
      throw new BadRequestException('Solo se pueden emitir ventas confirmadas.');
    }

    return sale;
  }

  private resolveRecipientEmail(to: string | undefined, sale: Sale): string | null {
    const candidate = to || sale.billingSnapshotEmail || sale.customer?.email;
    const email = candidate?.trim();
    return email || null;
  }

  private formatMoney(value: unknown): string {
    return Number(value || 0).toFixed(2);
  }

  private async createPendingDocument(
    sale: Sale,
    payload: ApisPeruInvoicePayload,
  ): Promise<ElectronicDocument> {
    const existing = await this.electronicDocumentRepo.findOne({
      where: {
        companyId: sale.companyId,
        documentType: sale.documentType,
        series: sale.series,
        number: sale.number,
      },
    });

    if (existing?.status === ElectronicDocumentStatus.ACCEPTED) {
      throw new BadRequestException('Esta venta ya tiene un comprobante electronico aceptado por SUNAT.');
    }

    const document = existing ?? this.electronicDocumentRepo.create({
      saleId: sale.id,
      companyId: sale.companyId,
      documentType: sale.documentType,
      sunatDocumentTypeCode: payload.tipoDoc,
      series: sale.series,
      number: sale.number,
      provider: 'APIS_PERU',
    });

    Object.assign(document, {
      saleId: sale.id,
      companyId: sale.companyId,
      providerEndpoint: '/invoice/send',
      documentType: sale.documentType,
      sunatDocumentTypeCode: payload.tipoDoc,
      series: sale.series,
      number: sale.number,
      status: ElectronicDocumentStatus.PENDING,
      payloadJson: payload,
      responseJson: null,
      xml: null,
      hash: null,
      cdrZip: null,
      sunatCode: null,
      sunatDescription: null,
      sunatNotes: null,
      errorMessage: null,
      sentAt: null,
      acceptedAt: null,
      rejectedAt: null,
    });

    return this.electronicDocumentRepo.save(document);
  }

  private async markDocumentWithResponse(
    document: ElectronicDocument,
    response: ApisPeruDocumentResponse,
  ): Promise<ElectronicDocument> {
    const cdrResponse = response.sunatResponse?.cdrResponse;
    const success = response.sunatResponse?.success;
    const status =
      success === true
        ? ElectronicDocumentStatus.ACCEPTED
        : success === false
          ? ElectronicDocumentStatus.REJECTED
          : ElectronicDocumentStatus.SENT;

    Object.assign(document, {
      status,
      responseJson: response,
      xml: response.xml ?? null,
      hash: response.hash ?? null,
      cdrZip: response.sunatResponse?.cdrZip ?? null,
      sunatCode: cdrResponse?.code ?? null,
      sunatDescription: cdrResponse?.description ?? null,
      sunatNotes: cdrResponse?.notes ?? null,
      errorMessage: status === ElectronicDocumentStatus.REJECTED ? cdrResponse?.description ?? 'SUNAT rechazo el comprobante.' : null,
      sentAt: new Date(),
      acceptedAt: status === ElectronicDocumentStatus.ACCEPTED ? new Date() : null,
      rejectedAt: status === ElectronicDocumentStatus.REJECTED ? new Date() : null,
    });

    return this.electronicDocumentRepo.save(document);
  }

  private async markDocumentWithError(
    document: ElectronicDocument,
    error: unknown,
  ): Promise<ElectronicDocument> {
    Object.assign(document, {
      status: ElectronicDocumentStatus.ERROR,
      responseJson: this.getErrorResponse(error),
      errorMessage: this.getErrorMessage(error),
      sentAt: new Date(),
      acceptedAt: null,
      rejectedAt: null,
    });

    return this.electronicDocumentRepo.save(document);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as any).message;
        return Array.isArray(message) ? message.join('; ') : String(message);
      }
    }

    return error instanceof Error ? error.message : 'Error desconocido al emitir comprobante electronico.';
  }

  private getErrorResponse(error: unknown): unknown {
    if (error instanceof HttpException) return error.getResponse();
    if (error instanceof Error) return { message: error.message, name: error.name };
    return { message: 'Error desconocido', error };
  }

  private buildDocumentFileName(document: ElectronicDocument): string {
    const payload = this.isInvoicePayload(document.payloadJson) ? document.payloadJson : null;
    const ruc = payload?.company?.ruc || document.companyId;
    return `${ruc}-${document.sunatDocumentTypeCode}-${document.series}-${document.number}`;
  }

  private isInvoicePayload(value: unknown): value is ApisPeruInvoicePayload {
    return !!value
      && typeof value === 'object'
      && 'tipoDoc' in value
      && 'serie' in value
      && 'correlativo' in value
      && 'company' in value
      && 'client' in value
      && 'details' in value;
  }
}
