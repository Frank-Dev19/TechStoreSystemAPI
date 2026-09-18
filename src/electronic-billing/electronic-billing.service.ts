import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import {
  ApisPeruCancellationPayload,
  ApisPeruDocumentResponse,
  ApisPeruInvoicePayload,
  ApisPeruTicketStatusResponse,
} from './dto/apisperu-invoice.types';
import { ElectronicDocument } from './entities/electronic-document.entity';
import { ElectronicDocumentStatus } from './enums/electronic-document-status.enum';
import { mapSaleToApisPeruInvoicePayload } from './mappers/sale-to-apisperu-invoice.mapper';
import { ApisPeruBillingClient } from './services/apisperu-billing.client';
import { MailerService } from '../mailer/mailer.service';
import { SendElectronicDocumentEmailDto } from './dto/send-electronic-document-email.dto';
import { MailPurpose } from '../mail-settings/enums/mail-purpose.enum';
import { ServiceOrderSaleLink } from '../service-orders/entities/service-order-sale-link.entity';
import { ServiceOrder } from '../service-orders/entities/service-order.entity';
import { ServiceOrderMessageMatrixService } from '../service-orders/services/service-order-message-matrix.service';
import { PrivateFileStorageService } from '../service-orders/storage/private-file-storage.service';
import { ServiceOrderTempDocumentsService } from '../service-orders/documents/service-order-temp-documents.service';
import { RequestElectronicCancellationDto } from './dto/request-electronic-cancellation.dto';
import { ElectronicCancellationStatus } from './enums/electronic-cancellation-status.enum';
import { DocumentType } from '../sales/enums/document-type.enum';
import { SalesService } from '../sales/services/sales.service';
import { ElectronicCreditNote } from './entities/electronic-credit-note.entity';
import { RequestFullRefundDto } from './dto/request-full-refund.dto';
import { DocumentSeriesService } from '../sales/services/document-series.service';

const CREDIT_NOTE_CLAIM_TIMEOUT_MS = 30_000;

type AutomaticEmailDelivery = {
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  to?: string;
  message: string;
};

@Injectable()
export class ElectronicBillingService {
  private readonly logger = new Logger(ElectronicBillingService.name);

  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(ElectronicDocument)
    private readonly electronicDocumentRepo: Repository<ElectronicDocument>,
    @InjectRepository(ElectronicCreditNote)
    private readonly creditNoteRepo: Repository<ElectronicCreditNote>,
    private readonly dataSource: DataSource,
    private readonly businessProfileService: BusinessProfileService,
    private readonly apisPeruClient: ApisPeruBillingClient,
    private readonly mailerService: MailerService,
    @InjectRepository(ServiceOrderSaleLink)
    private readonly serviceOrderSaleLinkRepository: Repository<ServiceOrderSaleLink>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
    private readonly privateStorage: PrivateFileStorageService,
    private readonly tempDocumentsService: ServiceOrderTempDocumentsService,
    private readonly configService: ConfigService,
    private readonly salesService: SalesService,
    private readonly documentSeriesService: DocumentSeriesService,
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
    emailDelivery?: AutomaticEmailDelivery;
  }> {
    const sale = await this.findSaleForBilling(saleId);
    const company = await this.businessProfileService.getInvoiceCompanyPayload();
    const payload = mapSaleToApisPeruInvoicePayload(sale, company);
    const document = await this.createPendingDocument(sale, payload);

    try {
      const response = await this.apisPeruClient.sendInvoice(payload);
      const savedDocument = await this.markDocumentWithResponse(document, response);

      let emailDelivery: AutomaticEmailDelivery | undefined;
      if (savedDocument.status === ElectronicDocumentStatus.ACCEPTED) {
        await this.notifyAcceptedReceipt(sale, savedDocument).catch((error) => {
          this.logger.error(
            `El comprobante ${savedDocument.id} fue aceptado, pero no pudo notificarse por WhatsApp: ${(error as Error).message}`,
          );
        });
        emailDelivery = await this.tryEmailAcceptedInvoice(sale, savedDocument);
      }

      return {
        saleId,
        payload,
        document: savedDocument,
        response,
        emailDelivery,
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

  async sendInvoicesBatch(saleIds: number[]): Promise<{
    total: number;
    accepted: number;
    pending: number;
    failed: number;
    emailsSent: number;
    emailsSkipped: number;
    emailsFailed: number;
    results: Array<{
      saleId: number;
      ok: boolean;
      document?: ElectronicDocument;
      emailDelivery?: AutomaticEmailDelivery;
      error?: string;
    }>;
  }> {
    const results: Array<{
      saleId: number;
      ok: boolean;
      document?: ElectronicDocument;
      emailDelivery?: AutomaticEmailDelivery;
      error?: string;
    }> = [];
    for (const saleId of saleIds) {
      try {
        const response = await this.sendInvoice(saleId);
        const ok = ![ElectronicDocumentStatus.REJECTED, ElectronicDocumentStatus.ERROR]
          .includes(response.document.status);
        results.push({
          saleId,
          ok,
          document: response.document,
          emailDelivery: response.emailDelivery,
        });
      } catch (error) {
        results.push({ saleId, ok: false, error: this.getErrorMessage(error) });
      }
    }
    return {
      total: results.length,
      accepted: results.filter((result) => result.document?.status === ElectronicDocumentStatus.ACCEPTED).length,
      pending: results.filter((result) => result.document?.status === ElectronicDocumentStatus.SENT).length,
      failed: results.filter((result) => !result.ok).length,
      emailsSent: results.filter((result) => result.emailDelivery?.status === 'SENT').length,
      emailsSkipped: results.filter((result) => result.emailDelivery?.status === 'SKIPPED').length,
      emailsFailed: results.filter((result) => result.emailDelivery?.status === 'FAILED').length,
      results,
    };
  }

  async requestCancellation(
    saleId: number,
    dto: RequestElectronicCancellationDto,
    user: string,
  ): Promise<{ sale: Sale; document?: ElectronicDocument; pending: boolean; message: string }> {
    const sale = await this.findSaleForBilling(saleId);
    const document = await this.electronicDocumentRepo.findOne({
      where: { saleId },
      order: { id: 'DESC' },
    });

    await this.assertNoBlockingCreditNote(saleId);

    if (!document || document.status !== ElectronicDocumentStatus.ACCEPTED) {
      const cancelledSale = await this.salesService.cancel(saleId, dto, user);
      return {
        sale: cancelledSale,
        pending: false,
        message: 'La venta fue anulada localmente porque no tenía un comprobante aceptado por SUNAT.',
      };
    }

    if (document.cancellationStatus === ElectronicCancellationStatus.ACCEPTED) {
      const cancelledSale = await this.finalizeAcceptedCancellation(saleId, dto, user);
      return {
        sale: cancelledSale,
        document,
        pending: false,
        message: 'La anulación electrónica ya estaba aceptada y la venta quedó anulada.',
      };
    }

    if (
      document.cancellationStatus === ElectronicCancellationStatus.PENDING
      && document.cancellationTicket
    ) {
      return {
        sale,
        document,
        pending: true,
        message: 'La anulación ya fue enviada y continúa pendiente de respuesta de SUNAT.',
      };
    }

    // A baja aceptada por SUNAT no se puede revertir. Verificamos primero que
    // la caja todavía pueda absorber la reversión de los pagos originales.
    await this.salesService.validateCancellationAvailability(saleId);

    const company = await this.businessProfileService.getInvoiceCompanyPayload();
    const endpoint = sale.documentType === DocumentType.FACTURA ? '/voided/send' : '/summary/send';
    const payload = this.buildCancellationPayload(sale, document, company, dto.reason);

    const cancellationClaim = await this.claimCancellation(document.id, saleId, {
      cancellationStatus: ElectronicCancellationStatus.PENDING,
      cancellationEndpoint: endpoint,
      cancellationReason: dto.reason.trim(),
      cancellationObservations: dto.observations?.trim() || null,
      cancellationRequestedBy: user,
      cancellationPayloadJson: payload,
      cancellationResponseJson: null,
      cancellationErrorMessage: null,
      cancellationRequestedAt: new Date(),
      cancellationResolvedAt: null,
    });
    Object.assign(document, cancellationClaim.document);
    if (!cancellationClaim.shouldSend) {
      return {
        sale,
        document,
        pending: true,
        message: 'La solicitud de baja ya está siendo procesada. Espere antes de volver a intentarlo.',
      };
    }

    try {
      const response = sale.documentType === DocumentType.FACTURA
        ? await this.apisPeruClient.sendVoided(payload)
        : await this.apisPeruClient.sendSummary(payload);
      const ticket = response.sunatResponse?.ticket;
      if (!ticket) {
        throw new BadRequestException('APIsPeru no devolvió el ticket de seguimiento de la anulación.');
      }

      Object.assign(document, {
        cancellationTicket: ticket,
        cancellationResponseJson: response,
      });
      await this.electronicDocumentRepo.save(document);

      return {
        sale,
        document,
        pending: true,
        message: 'La solicitud fue enviada. Consulte su estado para completar la anulación.',
      };
    } catch (error) {
      Object.assign(document, {
        cancellationStatus: ElectronicCancellationStatus.ERROR,
        cancellationResponseJson: this.getErrorResponse(error),
        cancellationErrorMessage: this.getErrorMessage(error),
        cancellationResolvedAt: new Date(),
      });
      await this.electronicDocumentRepo.save(document);
      throw error;
    }
  }

  async refreshCancellationStatus(
    saleId: number,
    user: string,
  ): Promise<{ sale: Sale; document: ElectronicDocument; pending: boolean; message: string }> {
    const document = await this.findBySale(saleId);
    if (!document.cancellationTicket || !document.cancellationEndpoint) {
      throw new BadRequestException('La venta no tiene una solicitud electrónica de anulación pendiente.');
    }

    if (document.cancellationStatus === ElectronicCancellationStatus.ACCEPTED) {
      const sale = await this.finalizeAcceptedCancellation(
        saleId,
        this.cancellationDtoFromDocument(document),
        user,
      );
      return { sale, document, pending: false, message: 'Anulación aceptada por SUNAT.' };
    }

    const company = await this.businessProfileService.getInvoiceCompanyPayload();
    const response = document.cancellationEndpoint === '/voided/send'
      ? await this.apisPeruClient.getVoidedStatus(document.cancellationTicket, company.ruc)
      : await this.apisPeruClient.getSummaryStatus(document.cancellationTicket, company.ruc);
    const resolution = this.resolveTicketStatus(response);

    Object.assign(document, {
      cancellationResponseJson: response,
      cancellationStatus: resolution.status,
      cancellationErrorMessage: resolution.message,
      cancellationResolvedAt: resolution.status === ElectronicCancellationStatus.PENDING ? null : new Date(),
    });
    await this.electronicDocumentRepo.save(document);

    if (resolution.status === ElectronicCancellationStatus.ACCEPTED) {
      const sale = await this.finalizeAcceptedCancellation(
        saleId,
        this.cancellationDtoFromDocument(document),
        document.cancellationRequestedBy || user,
      );
      return { sale, document, pending: false, message: resolution.message };
    }

    const sale = await this.findSaleForBilling(saleId);
    return {
      sale,
      document,
      pending: resolution.status === ElectronicCancellationStatus.PENDING,
      message: resolution.message,
    };
  }

  async requestFullRefund(
    saleId: number,
    dto: RequestFullRefundDto,
    user: string,
  ): Promise<{ sale: Sale; creditNote?: ReturnType<ElectronicBillingService['toCreditNoteSummary']>; message: string }> {
    const reasonCode = dto.reasonCode || '06';
    const sale = await this.findSaleById(saleId);
    if (![SaleStatus.CONFIRMED, SaleStatus.REFUNDED].includes(sale.status)) {
      throw new BadRequestException('Solo se puede revertir una venta emitida.');
    }
    const document = await this.electronicDocumentRepo.findOne({
      where: { saleId },
      order: { id: 'DESC' },
    });
    if (!document || document.status !== ElectronicDocumentStatus.ACCEPTED) {
      const refundedSale = await this.salesService.refundFull(
        saleId,
        dto.reason,
        dto.refundMethod,
        user,
        dto.observations,
      );
      return {
        sale: refundedSale,
        message: reasonCode === '01'
          ? 'La anulación se registró localmente porque no existía un comprobante aceptado por SUNAT.'
          : 'La devolución se registró localmente porque no existía un comprobante aceptado por SUNAT.',
      };
    }

    if (sale.status === SaleStatus.REFUNDED) {
      const acceptedNote = await this.creditNoteRepo.findOne({
        where: { saleId, status: ElectronicDocumentStatus.ACCEPTED },
        order: { id: 'DESC' },
      });
      if (!acceptedNote) {
        throw new BadRequestException('La venta ya se encuentra devuelta y no admite otra nota de crédito total.');
      }
      return {
        sale,
        creditNote: this.toCreditNoteSummary(acceptedNote, sale.status),
        message: 'La venta ya fue revertida mediante una nota de crédito aceptada.',
      };
    }

    await this.salesService.validateFullRefundAvailability(saleId, dto.refundMethod);

    const creditNoteClaim = await this.claimCreditNote(sale, document, reasonCode, dto, user);
    const creditNote = creditNoteClaim.note;
    if (creditNote?.status === ElectronicDocumentStatus.ACCEPTED) {
      creditNote.refundMethod = dto.refundMethod;
      await this.creditNoteRepo.save(creditNote);
      const refundedSale = await this.salesService.refundFull(
        saleId,
        creditNote.reason,
        dto.refundMethod,
        user,
        creditNote.observations || undefined,
      );
      return {
        sale: refundedSale,
        creditNote: this.toCreditNoteSummary(creditNote),
        message: 'La nota de crédito ya había sido aceptada y su reversión quedó aplicada.',
      };
    }
    if (creditNote?.status === ElectronicDocumentStatus.REJECTED) {
      throw new BadRequestException('SUNAT rechazó la nota de crédito. Revise su respuesta antes de realizar otra operación fiscal.');
    }
    if (!creditNoteClaim.shouldSend) {
      throw new BadRequestException('La nota de crédito de esta venta todavía está en proceso.');
    }

    try {
      const company = await this.businessProfileService.getInvoiceCompanyPayload();
      const invoice = this.isInvoicePayload(document.payloadJson) ? document.payloadJson : null;
      if (!invoice) throw new BadRequestException('No se encontró el contenido fiscal original del comprobante.');

      const payload = creditNote.payloadJson && typeof creditNote.payloadJson === 'object'
        ? creditNote.payloadJson
        : this.buildFullCreditNotePayload(creditNote, document, invoice, company);
      Object.assign(creditNote, {
        payloadJson: payload,
        refundMethod: dto.refundMethod,
        observations: dto.observations?.trim() || creditNote.observations || null,
        status: ElectronicDocumentStatus.PENDING,
        responseJson: null,
        errorMessage: null,
      });
      await this.creditNoteRepo.save(creditNote);

      const response = await this.apisPeruClient.sendCreditNote(payload);
      const success = response.sunatResponse?.success;
      const status = success === true
        ? ElectronicDocumentStatus.ACCEPTED
        : success === false
          ? ElectronicDocumentStatus.REJECTED
          : ElectronicDocumentStatus.SENT;
      Object.assign(creditNote, {
        status,
        responseJson: response,
        xml: response.xml || null,
        cdrZip: response.sunatResponse?.cdrZip || null,
        sunatDescription: response.sunatResponse?.cdrResponse?.description || null,
        errorMessage: status === ElectronicDocumentStatus.REJECTED
          ? response.sunatResponse?.cdrResponse?.description || 'SUNAT rechazó la nota de crédito.'
          : null,
        acceptedAt: status === ElectronicDocumentStatus.ACCEPTED ? new Date() : null,
      });
      await this.creditNoteRepo.save(creditNote);
      if (status !== ElectronicDocumentStatus.ACCEPTED) {
        throw new BadRequestException(creditNote.errorMessage || 'La nota de crédito no fue aceptada todavía.');
      }

      const refundedSale = await this.salesService.refundFull(
        saleId,
        creditNote.reason,
        dto.refundMethod,
        user,
        creditNote.observations || undefined,
      );
      return {
        sale: refundedSale,
        creditNote: this.toCreditNoteSummary(creditNote),
        message: reasonCode === '01'
          ? 'Nota de crédito por anulación aceptada y operación revertida correctamente.'
          : 'Nota de crédito aceptada y devolución registrada correctamente.',
      };
    } catch (error) {
      if (creditNote.status === ElectronicDocumentStatus.PENDING) {
        Object.assign(creditNote, {
          status: ElectronicDocumentStatus.ERROR,
          responseJson: this.getErrorResponse(error),
          errorMessage: this.getErrorMessage(error),
        });
        await this.creditNoteRepo.save(creditNote);
      }
      throw error;
    }
  }

  async findCreditNoteBySale(saleId: number) {
    const [note, sale] = await Promise.all([
      this.findAcceptedOrLatestCreditNote(saleId),
      this.findSaleById(saleId),
    ]);
    return this.toCreditNoteSummary(note, sale.status);
  }

  async getCreditNoteXmlFile(saleId: number): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const note = await this.findAcceptedOrLatestCreditNote(saleId);
    if (!note.xml) throw new NotFoundException('La nota de crédito no tiene XML registrado.');
    return {
      buffer: Buffer.from(note.xml, 'utf8'),
      filename: `${this.buildCreditNoteFileName(note)}.xml`,
      contentType: 'application/xml; charset=utf-8',
    };
  }

  async getCreditNoteCdrFile(saleId: number): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const note = await this.findAcceptedOrLatestCreditNote(saleId);
    if (!note.cdrZip) throw new NotFoundException('La nota de crédito no tiene CDR registrado.');
    return {
      buffer: Buffer.from(note.cdrZip, 'base64'),
      filename: `R-${this.buildCreditNoteFileName(note)}.zip`,
      contentType: 'application/zip',
    };
  }

  async getCreditNotePdfFile(saleId: number): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const note = await this.findAcceptedOrLatestCreditNote(saleId);
    if (note.status !== ElectronicDocumentStatus.ACCEPTED) {
      throw new BadRequestException('La nota de crédito todavía no fue aceptada por SUNAT.');
    }
    if (!note.payloadJson || typeof note.payloadJson !== 'object') {
      throw new NotFoundException('No se encontró el contenido fiscal de la nota de crédito.');
    }
    return {
      buffer: await this.apisPeruClient.generateCreditNotePdf(note.payloadJson),
      filename: `${this.buildCreditNoteFileName(note)}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async emailCreditNote(
    saleId: number,
    dto: SendElectronicDocumentEmailDto = {},
  ): Promise<{ ok: true; saleId: number; to: string; message: string }> {
    const sale = await this.findSaleById(saleId);
    const note = await this.findAcceptedOrLatestCreditNote(saleId);
    if (note.status !== ElectronicDocumentStatus.ACCEPTED) {
      throw new BadRequestException('La nota de crédito todavía no fue aceptada por SUNAT.');
    }
    const to = this.resolveRecipientEmail(dto.to, sale);
    if (!to) {
      throw new BadRequestException('El cliente no tiene correo registrado.');
    }

    const pdf = await this.getCreditNotePdfFile(saleId);
    const xml = await this.getCreditNoteXmlFile(saleId);
    const attachments = [
      { filename: pdf.filename, content: pdf.buffer, contentType: pdf.contentType },
      { filename: xml.filename, content: xml.buffer, contentType: xml.contentType },
    ];
    if (note.cdrZip) {
      const cdr = await this.getCreditNoteCdrFile(saleId);
      attachments.push({ filename: cdr.filename, content: cdr.buffer, contentType: cdr.contentType });
    }

    const documentLabel = `${note.series}-${note.number}`;
    const customerName = sale.billingSnapshotName || sale.customer?.name || 'cliente';
    const customMessage = dto.message?.trim();
    const message = await this.mailerService.prepareMessage(
      MailPurpose.ELECTRONIC_BILLING,
      {
        subject: 'Nota de crédito electrónica {documento}',
        intro: 'Adjuntamos la nota de crédito electrónica asociada a su comprobante.',
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
          <p><strong>Nota de crédito:</strong> ${this.mailerService.escapeHtml(documentLabel)}</p>
          <p><strong>Comprobante afectado:</strong> ${this.mailerService.escapeHtml(`${sale.series}-${sale.number}`)}</p>
          <p><strong>Monto:</strong> S/ ${this.formatMoney(note.amount)}</p>
          ${customMessage ? `<p>${this.mailerService.escapeHtml(customMessage)}</p>` : ''}
          <p>Se adjunta el PDF y XML${note.cdrZip ? ', junto con el CDR de SUNAT' : ''}.</p>
          <p>${message.footerHtml}</p>
        </div>
      `,
      text: `Nota de crédito ${documentLabel}, asociada al comprobante ${sale.series}-${sale.number}.`,
      attachments,
      purpose: MailPurpose.ELECTRONIC_BILLING,
    });
    return { ok: true, saleId, to, message: 'Nota de crédito enviada por correo.' };
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
    const sale = await this.findSaleById(saleId);

    if (sale.status !== SaleStatus.CONFIRMED) {
      throw new BadRequestException('Solo se pueden emitir ventas confirmadas.');
    }

    return sale;
  }

  private async findSaleById(saleId: number): Promise<Sale> {
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

    return sale;
  }

  private async findAcceptedOrLatestCreditNote(saleId: number): Promise<ElectronicCreditNote> {
    const notes = await this.creditNoteRepo.find({
      where: { saleId },
      order: { id: 'DESC' },
    });
    const note = notes.find((item) => item.status === ElectronicDocumentStatus.ACCEPTED) || notes[0];
    if (!note) throw new NotFoundException(`La venta ${saleId} no tiene nota de crédito registrada.`);
    return note;
  }

  private async assertNoBlockingCreditNote(saleId: number): Promise<void> {
    const note = await this.creditNoteRepo.findOne({
      where: {
        saleId,
        status: In([
          ElectronicDocumentStatus.PENDING,
          ElectronicDocumentStatus.SENT,
          ElectronicDocumentStatus.ACCEPTED,
          ElectronicDocumentStatus.ERROR,
        ]),
      },
      order: { id: 'DESC' },
    });
    if (note && note.status !== ElectronicDocumentStatus.REJECTED) {
      throw new BadRequestException(
        note.status === ElectronicDocumentStatus.ACCEPTED
          ? 'La venta ya tiene una nota de crédito aceptada. Complete su devolución local; no se puede solicitar también la baja del comprobante.'
          : 'La venta tiene una nota de crédito en proceso o pendiente de revisión. No se puede solicitar su baja.',
      );
    }
  }

  private assertNoBlockingCancellation(document: ElectronicDocument): void {
    if (
      document.cancellationStatus
      && document.cancellationStatus !== ElectronicCancellationStatus.REJECTED
    ) {
      throw new BadRequestException(
        document.cancellationStatus === ElectronicCancellationStatus.ACCEPTED
          ? 'El comprobante ya tiene una baja aceptada por SUNAT y no admite una nota de crédito.'
          : 'El comprobante tiene una solicitud de baja en proceso o pendiente de revisión y no admite una nota de crédito.',
      );
    }
  }

  private async claimCancellation(
    documentId: number,
    saleId: number,
    values: Partial<ElectronicDocument>,
  ): Promise<{ document: ElectronicDocument; shouldSend: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const document = await manager.findOne(ElectronicDocument, {
        where: { id: documentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!document) throw new NotFoundException('No se encontró el comprobante electrónico de la venta.');

      const note = await manager.findOne(ElectronicCreditNote, {
        where: {
          saleId,
          status: In([
            ElectronicDocumentStatus.PENDING,
            ElectronicDocumentStatus.SENT,
            ElectronicDocumentStatus.ACCEPTED,
            ElectronicDocumentStatus.ERROR,
          ]),
        },
        order: { id: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (note && note.status !== ElectronicDocumentStatus.REJECTED) {
        throw new BadRequestException(
          note.status === ElectronicDocumentStatus.ACCEPTED
            ? 'La venta ya tiene una nota de crédito aceptada. Complete su devolución local; no se puede solicitar también la baja del comprobante.'
            : 'La venta tiene una nota de crédito en proceso o pendiente de revisión. No se puede solicitar su baja.',
        );
      }

      if (
        document.cancellationStatus === ElectronicCancellationStatus.ACCEPTED
        || document.cancellationStatus === ElectronicCancellationStatus.PENDING
      ) {
        return { document, shouldSend: false };
      }

      Object.assign(document, values);
      return {
        document: await manager.save(ElectronicDocument, document),
        shouldSend: true,
      };
    });
  }

  private async claimCreditNote(
    sale: Sale,
    sourceDocument: ElectronicDocument,
    reasonCode: string,
    dto: RequestFullRefundDto,
    user: string,
  ): Promise<{ note: ElectronicCreditNote; shouldSend: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const document = await manager.findOne(ElectronicDocument, {
        where: { id: sourceDocument.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!document) throw new NotFoundException('No se encontró el comprobante electrónico de la venta.');
      this.assertNoBlockingCancellation(document);

      const activeNote = await manager.findOne(ElectronicCreditNote, {
        where: {
          saleId: sale.id,
          status: In([
            ElectronicDocumentStatus.PENDING,
            ElectronicDocumentStatus.SENT,
            ElectronicDocumentStatus.ACCEPTED,
            ElectronicDocumentStatus.ERROR,
          ]),
        },
        order: { id: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      const existing = activeNote || await manager.findOne(ElectronicCreditNote, {
        where: { saleId: sale.id },
        order: { id: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        if (existing.reasonCode !== reasonCode && existing.status !== ElectronicDocumentStatus.REJECTED) {
          throw new BadRequestException(
            'La venta ya tiene una nota de crédito con otro motivo fiscal. Debe completar o revisar esa operación.',
          );
        }
        const canRecoverUnsentClaim =
          existing.status === ElectronicDocumentStatus.PENDING
          && !existing.payloadJson
          && this.isCreditNoteClaimStale(existing);
        const canRetryError = existing.status === ElectronicDocumentStatus.ERROR;
        if (canRecoverUnsentClaim || canRetryError) {
          Object.assign(existing, {
            refundMethod: dto.refundMethod,
            observations: dto.observations?.trim() || existing.observations || null,
            status: ElectronicDocumentStatus.PENDING,
            responseJson: null,
            errorMessage: null,
          });
          return {
            note: await manager.save(ElectronicCreditNote, existing),
            shouldSend: true,
          };
        }
        return { note: existing, shouldSend: false };
      }

      const numbering = await this.documentSeriesService.reserveNextCreditNoteNumber(
        manager,
        sale.companyId,
        sale.documentType as DocumentType.BOLETA | DocumentType.FACTURA,
      );
      const note = manager.create(ElectronicCreditNote, {
        saleId: sale.id,
        companyId: sale.companyId,
        series: numbering.series,
        number: numbering.number,
        reasonCode,
        reason: dto.reason.trim(),
        observations: dto.observations?.trim() || null,
        refundMethod: dto.refundMethod,
        amount: Number(sale.total),
        status: ElectronicDocumentStatus.PENDING,
        createdBy: user,
      });
      return {
        note: await manager.save(ElectronicCreditNote, note),
        shouldSend: true,
      };
    });
  }

  private isCreditNoteClaimStale(note: ElectronicCreditNote): boolean {
    const lastUpdated = note.updatedAt || note.createdAt;
    if (!lastUpdated) return true;
    return Date.now() - new Date(lastUpdated).getTime() >= CREDIT_NOTE_CLAIM_TIMEOUT_MS;
  }

  private toCreditNoteSummary(note: ElectronicCreditNote, saleStatus?: SaleStatus) {
    return {
      id: note.id,
      saleId: note.saleId,
      series: note.series,
      number: note.number,
      reasonCode: note.reasonCode,
      reason: note.reason,
      observations: note.observations || null,
      refundMethod: note.refundMethod,
      amount: Number(note.amount),
      status: note.status,
      sunatDescription: note.sunatDescription || null,
      errorMessage: note.errorMessage || null,
      acceptedAt: note.acceptedAt || null,
      createdAt: note.createdAt,
      hasXml: !!note.xml,
      hasCdr: !!note.cdrZip,
      localApplicationPending:
        note.status === ElectronicDocumentStatus.ACCEPTED
        && saleStatus === SaleStatus.CONFIRMED,
    };
  }

  private buildCreditNoteFileName(note: ElectronicCreditNote): string {
    return `07-${note.series}-${note.number}`;
  }

  private resolveRecipientEmail(to: string | undefined, sale: Sale): string | null {
    const candidate = to || sale.billingSnapshotEmail || sale.customer?.email;
    const email = candidate?.trim();
    return email || null;
  }

  private async tryEmailAcceptedInvoice(
    sale: Sale,
    document: ElectronicDocument,
  ): Promise<AutomaticEmailDelivery> {
    const to = this.resolveRecipientEmail(undefined, sale);
    if (!to) {
      return {
        status: 'SKIPPED',
        message: 'El comprobante fue aceptado, pero el cliente no tiene correo registrado.',
      };
    }

    try {
      await this.emailInvoice(sale.id, { to });
      return {
        status: 'SENT',
        to,
        message: `Comprobante enviado automáticamente a ${to}.`,
      };
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(
        `El comprobante ${document.id} fue aceptado, pero falló el correo automático a ${to}: ${message}`,
      );
      return {
        status: 'FAILED',
        to,
        message: 'El comprobante fue aceptado, pero no pudo enviarse automáticamente por correo.',
      };
    }
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

  private async notifyAcceptedReceipt(sale: Sale, document: ElectronicDocument): Promise<void> {
    const links = await this.serviceOrderSaleLinkRepository.find({ where: { saleId: sale.id } });
    if (links.length !== 1) {
      if (links.length > 1) {
        this.logger.warn(`No se envió el comprobante ${document.id}: la venta histórica está ligada a ${links.length} órdenes`);
      }
      return;
    }
    const order = await this.serviceOrderRepository.findOne({ where: { id: Number(links[0].serviceOrderId) } });
    if (!order) return;
    const pdf = await this.getInvoicePdfFile(sale.id);
    const stored = await this.privateStorage.store(
      'service-orders', ['electronic-receipts', String(order.id)], pdf.filename, pdf.buffer,
    );
    const tempDocument = await this.tempDocumentsService.createRecord({
      sourceType: 'ELECTRONIC_RECEIPT', mimeType: pdf.contentType, fileName: pdf.filename,
      absolutePath: stored.absolutePath,
      metadata: { serviceOrderId: order.id, saleId: sale.id, electronicDocumentId: document.id },
    });
    const baseUrl = (this.configService.get<string>('APP_PUBLIC_BASE_URL') || 'http://localhost:3000').replace(/\/+$/, '');
    await this.messageMatrixService.dispatchPaymentReceiptTemplate({
      serviceOrder: order,
      electronicDocumentId: document.id,
      documentNumber: `${document.series}-${document.number}`,
      totalAmount: Number(sale.total),
      documentUrl: `${baseUrl}/service-orders/temp-documents/${tempDocument.token}`,
      documentFileName: pdf.filename,
      tempDocumentToken: tempDocument.token,
    });
  }

  private buildCancellationPayload(
    sale: Sale,
    document: ElectronicDocument,
    company: Awaited<ReturnType<BusinessProfileService['getInvoiceCompanyPayload']>>,
    reason: string,
  ): ApisPeruCancellationPayload {
    const now = this.toLimaDateTime(new Date());
    const issueDate = `${sale.issueDate}T00:00:00-05:00`;
    const correlativo = String(document.id).padStart(5, '0');

    if (sale.documentType === DocumentType.FACTURA) {
      return {
        correlativo,
        fecGeneracion: issueDate,
        fecComunicacion: now,
        company,
        details: [{
          tipoDoc: document.sunatDocumentTypeCode,
          serie: document.series,
          correlativo: String(Number(document.number)),
          desMotivoBaja: reason.trim(),
        }],
      };
    }

    if (sale.documentType !== DocumentType.BOLETA) {
      throw new BadRequestException('Solo se admite anulación electrónica de boletas y facturas.');
    }

    const invoice = this.isInvoicePayload(document.payloadJson) ? document.payloadJson : null;
    if (!invoice) {
      throw new BadRequestException('No se encontró el contenido fiscal original de la boleta.');
    }

    return {
      correlativo,
      fecGeneracion: issueDate,
      fecResumen: now,
      moneda: invoice.tipoMoneda,
      company,
      details: [{
        tipoDoc: document.sunatDocumentTypeCode,
        serieNro: `${document.series}-${Number(document.number)}`,
        estado: '3',
        clienteTipo: invoice.client.tipoDoc || '0',
        clienteNro: invoice.client.numDoc,
        total: invoice.mtoImpVenta,
        mtoOperGravadas: invoice.mtoOperGravadas,
        mtoIGV: invoice.mtoIGV,
      }],
    };
  }

  private buildFullCreditNotePayload(
    creditNote: ElectronicCreditNote,
    document: ElectronicDocument,
    invoice: ApisPeruInvoicePayload,
    company: Awaited<ReturnType<BusinessProfileService['getInvoiceCompanyPayload']>>,
  ): Record<string, unknown> {
    return {
      ublVersion: '2.1',
      tipoDoc: '07',
      serie: creditNote.series,
      correlativo: String(Number(creditNote.number)),
      fechaEmision: this.toLimaDateTime(new Date()),
      tipDocAfectado: document.sunatDocumentTypeCode,
      numDocfectado: `${document.series}-${Number(document.number)}`,
      codMotivo: creditNote.reasonCode,
      desMotivo: creditNote.reason,
      tipoMoneda: invoice.tipoMoneda,
      client: invoice.client,
      company,
      mtoOperGravadas: invoice.mtoOperGravadas,
      mtoIGV: invoice.mtoIGV,
      totalImpuestos: invoice.totalImpuestos,
      mtoImpVenta: invoice.mtoImpVenta,
      details: invoice.details,
      legends: invoice.legends,
    };
  }

  private resolveTicketStatus(response: ApisPeruTicketStatusResponse): {
    status: ElectronicCancellationStatus;
    message: string;
  } {
    const code = String(response.code || response.cdrResponse?.code || '');
    const description = response.cdrResponse?.description;
    if (response.success === true) {
      return {
        status: ElectronicCancellationStatus.ACCEPTED,
        message: description || 'SUNAT aceptó la anulación del comprobante.',
      };
    }
    if (code === '98' || (!code && !response.cdrResponse && !response.error)) {
      return {
        status: ElectronicCancellationStatus.PENDING,
        message: 'SUNAT todavía está procesando la solicitud de anulación.',
      };
    }
    return {
      status: ElectronicCancellationStatus.REJECTED,
      message: description || 'SUNAT rechazó la solicitud de anulación.',
    };
  }

  private async finalizeAcceptedCancellation(
    saleId: number,
    dto: RequestElectronicCancellationDto,
    user: string,
  ): Promise<Sale> {
    return this.salesService.cancel(saleId, dto, user, {
      electronicCancellationAccepted: true,
    });
  }

  private cancellationDtoFromDocument(document: ElectronicDocument): RequestElectronicCancellationDto {
    return {
      reason: document.cancellationReason || 'Anulación electrónica aceptada por SUNAT',
      observations: document.cancellationObservations || undefined,
    };
  }

  private toLimaDateTime(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}-05:00`;
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
