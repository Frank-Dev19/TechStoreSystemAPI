import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ServiceOrderTempDocumentsService } from './service-order-temp-documents.service';

@Controller('service-orders/temp-documents')
export class ServiceOrderTempDocumentsController {
  constructor(private readonly tempDocumentsService: ServiceOrderTempDocumentsService) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const document = await this.tempDocumentsService.resolveForDownload(token);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
    response.sendFile(document.absolutePath);
  }
}
