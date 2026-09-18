import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { ElectronicBillingService } from './electronic-billing.service';
import { SendElectronicDocumentEmailDto } from './dto/send-electronic-document-email.dto';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { RequestElectronicCancellationDto } from './dto/request-electronic-cancellation.dto';
import { SendInvoicesBatchDto } from './dto/send-invoices-batch.dto';
import { RequestFullRefundDto } from './dto/request-full-refund.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@Controller('electronic-billing')
export class ElectronicBillingController {
  constructor(private readonly service: ElectronicBillingService) {}

  @Get('sales/:saleId/invoice-payload')
  @Permissions('electronic-billing.read')
  buildInvoicePayload(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.buildInvoicePayload(saleId);
  }

  @Post('sales/:saleId/send-invoice')
  @Permissions('electronic-billing.send')
  sendInvoice(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.sendInvoice(saleId);
  }

  @Post('invoices/batch')
  @Permissions('electronic-billing.batch-send')
  sendInvoicesBatch(@Body() dto: SendInvoicesBatchDto) {
    return this.service.sendInvoicesBatch(dto.saleIds);
  }

  @Post('sales/:saleId/cancellation')
  @Permissions('electronic-billing.cancel')
  requestCancellation(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: RequestElectronicCancellationDto,
    @Req() request: any,
  ) {
    return this.service.requestCancellation(saleId, dto, request.user?.name || 'System');
  }

  @Post('sales/:saleId/cancellation/status')
  @Permissions('electronic-billing.cancel')
  refreshCancellationStatus(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Req() request: any,
  ) {
    return this.service.refreshCancellationStatus(saleId, request.user?.name || 'System');
  }

  @Post('sales/:saleId/refund')
  @Permissions('electronic-billing.refund')
  requestFullRefund(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: RequestFullRefundDto,
    @Req() request: any,
  ) {
    return this.service.requestFullRefund(saleId, dto, request.user?.name || 'System');
  }

  @Get('sales/:saleId/credit-note')
  @Permissions('electronic-billing.read')
  findCreditNote(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.findCreditNoteBySale(saleId);
  }

  @Get('sales/:saleId/credit-note/pdf')
  @Permissions('electronic-billing.download')
  async downloadCreditNotePdf(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    this.sendFile(response, await this.service.getCreditNotePdfFile(saleId));
  }

  @Get('sales/:saleId/credit-note/xml')
  @Permissions('electronic-billing.download')
  async downloadCreditNoteXml(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    this.sendFile(response, await this.service.getCreditNoteXmlFile(saleId));
  }

  @Get('sales/:saleId/credit-note/cdr')
  @Permissions('electronic-billing.download')
  async downloadCreditNoteCdr(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    this.sendFile(response, await this.service.getCreditNoteCdrFile(saleId));
  }

  @Post('sales/:saleId/credit-note/email')
  @Permissions('electronic-billing.email')
  emailCreditNote(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: SendElectronicDocumentEmailDto,
  ) {
    return this.service.emailCreditNote(saleId, dto);
  }

  @Post('sales/:saleId/email')
  @Permissions('electronic-billing.email')
  emailInvoice(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: SendElectronicDocumentEmailDto,
  ) {
    return this.service.emailInvoice(saleId, dto);
  }

  @Get('sales/:saleId/document')
  @Permissions('electronic-billing.read')
  findBySale(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.findBySale(saleId);
  }

  @Get('sales/:saleId/xml')
  @Permissions('electronic-billing.download')
  async downloadXml(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    const file = await this.service.getInvoiceXmlFile(saleId);
    this.sendFile(response, file);
  }

  @Get('sales/:saleId/cdr')
  @Permissions('electronic-billing.download')
  async downloadCdr(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    const file = await this.service.getInvoiceCdrFile(saleId);
    this.sendFile(response, file);
  }

  @Get('sales/:saleId/pdf')
  @Permissions('electronic-billing.download')
  async downloadPdf(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    const file = await this.service.getInvoicePdfFile(saleId);
    this.sendFile(response, file);
  }

  private sendFile(
    response: Response,
    file: { buffer: Buffer; filename: string; contentType: string },
  ) {
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Length', file.buffer.length);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }
}
