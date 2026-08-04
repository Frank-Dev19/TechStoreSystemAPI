import { Controller, Get, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { ElectronicBillingService } from './electronic-billing.service';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@Controller('electronic-billing')
export class ElectronicBillingController {
  constructor(private readonly service: ElectronicBillingService) {}

  @Get('sales/:saleId/invoice-payload')
  buildInvoicePayload(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.buildInvoicePayload(saleId);
  }

  @Post('sales/:saleId/send-invoice')
  sendInvoice(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.sendInvoice(saleId);
  }

  @Get('sales/:saleId/document')
  findBySale(@Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.findBySale(saleId);
  }

  @Get('sales/:saleId/xml')
  async downloadXml(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    const file = await this.service.getInvoiceXmlFile(saleId);
    this.sendFile(response, file);
  }

  @Get('sales/:saleId/cdr')
  async downloadCdr(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() response: Response,
  ) {
    const file = await this.service.getInvoiceCdrFile(saleId);
    this.sendFile(response, file);
  }

  @Get('sales/:saleId/pdf')
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
