import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
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
}
