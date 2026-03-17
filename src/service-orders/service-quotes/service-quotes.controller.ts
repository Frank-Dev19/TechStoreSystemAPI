import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceOrderQuotesService } from './service-quotes.service';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { CreateServiceOrderQuoteDto } from './dto/create-service-quote.dto';
import { UpdateServiceOrderQuoteDto } from './dto/update-service-quote.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { SendToClientServiceOrderQuoteDto } from './dto/send-to-client-service-quote.dto';
import { ApproveClientServiceOrderQuoteDto } from './dto/approve-client-service-quote.dto';
import { RejectClientServiceOrderQuoteDto } from './dto/reject-client-service-quote.dto';
import { ResubmitServiceOrderQuoteDto } from './dto/resubmit-service-quote.dto';
import { RECEPTIONIST_ROLE_NAMES, SUPERVISOR_ROLE_NAMES } from '../../common/constants/role-names';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES)
@Controller('service-order-quotes')
export class ServiceOrderQuotesController {
  constructor(private readonly serviceOrderQuotesService: ServiceOrderQuotesService) {}

  @Permissions('service-order-quote.read')
  @Get()
  findAll(@Query() query: any) {
    return this.serviceOrderQuotesService.findAll(query);
  }

  @Permissions('service-order-quote.read')
  @Get('technician-rankings')
  getTechnicianRevenueRankings() {
    return this.serviceOrderQuotesService.getTechnicianRevenueRankings();
  }

  @Permissions('service-order-quote.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.serviceOrderQuotesService.findOne(id, withDeleted === 'true');
  }

  @Permissions('service-order-quote.create')
  @Post()
  create(@Body() dto: CreateServiceOrderQuoteDto) {
    return this.serviceOrderQuotesService.create(dto);
  }

  @Permissions('service-order-quote.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceOrderQuoteDto) {
    return this.serviceOrderQuotesService.update(id, dto);
  }

  @Permissions('service-order-quote.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderQuotesService.softDelete(id);
  }

  @Permissions('service-order-quote.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderQuotesService.restore(id);
  }

  @Permissions('service-order-quote.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderQuotesService.bulkSoftDelete(dto.ids);
  }

  @Permissions('service-order-quote.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderQuotesService.bulkRestore(dto.ids);
  }

  @Permissions('service-order-quote.send-to-client')
  @Patch(':id/send-to-client')
  sendToClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendToClientServiceOrderQuoteDto,
  ) {
    return this.serviceOrderQuotesService.sendToClient(id, dto.notes);
  }

  @Permissions('service-order-quote.approve-client')
  @Patch(':id/approve-client')
  approveByClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveClientServiceOrderQuoteDto,
  ) {
    return this.serviceOrderQuotesService.approveByClient(id, dto.notes);
  }

  @Permissions('service-order-quote.reject-client')
  @Patch(':id/reject-client')
  rejectByClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectClientServiceOrderQuoteDto,
  ) {
    return this.serviceOrderQuotesService.rejectByClient(id, dto.notes);
  }

  @Permissions('service-order-quote.resubmit')
  @Patch(':id/resubmit')
  resubmitQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResubmitServiceOrderQuoteDto,
  ) {
    return this.serviceOrderQuotesService.resubmitQuote(id, dto);
  }

  @Permissions('service-order-quote.resubmit')
  @Patch(':id/resubmit-after-client-rejection')
  resubmitAfterClientRejection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResubmitServiceOrderQuoteDto,
  ) {
    return this.serviceOrderQuotesService.resubmitAfterClientRejection(id, dto);
  }
}
