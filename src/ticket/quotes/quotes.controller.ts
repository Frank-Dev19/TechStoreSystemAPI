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
import { QuotesService } from './quotes.service';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { ApproveSupervisorQuoteDto } from './dto/approve-supervisor-quote.dto';
import { RejectSupervisorQuoteDto } from './dto/reject-supervisor-quote.dto';
import { SendToClientQuoteDto } from './dto/send-to-client-quote.dto';
import { ApproveClientQuoteDto } from './dto/approve-client-quote.dto';
import { RejectClientQuoteDto } from './dto/reject-client-quote.dto';
import { ResubmitQuoteDto } from './dto/resubmit-quote.dto';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RECEPTIONIST_ROLE_NAMES, SUPERVISOR_ROLE_NAMES } from '../../common/constants/role-names';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Permissions('quote.read')
  @Get()
  findAll(@Query() query: any, @CurrentUser() userId?: number) {
    return this.quotesService.findAll(query, userId);
  }

  @Permissions('quote.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.quotesService.findOne(id, withDeleted === 'true');
  }

  @Permissions('quote.create')
  @Post()
  create(@Body() dto: CreateQuoteDto) {
    return this.quotesService.create(dto);
  }

  @Permissions('quote.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteDto) {
    return this.quotesService.update(id, dto);
  }

  @Permissions('quote.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.quotesService.softDelete(id);
  }

  @Permissions('quote.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.quotesService.restore(id);
  }

  @Permissions('quote.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.quotesService.bulkSoftDelete(dto.ids);
  }

  @Permissions('quote.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.quotesService.bulkRestore(dto.ids);
  }

  @Permissions('quote.approve-supervisor')
  @Patch(':id/approve-supervisor')
  approveBySupervisor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveSupervisorQuoteDto,
  ) {
    return this.quotesService.approveBySupervisor(id, dto.supervisorId, dto.notes);
  }

  @Permissions('quote.reject-supervisor')
  @Patch(':id/reject-supervisor')
  rejectBySupervisor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSupervisorQuoteDto,
  ) {
    return this.quotesService.rejectBySupervisor(id, dto.supervisorId, dto.notes);
  }

  @Permissions('quote.send-to-client')
  @Patch(':id/send-to-client')
  sendToClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendToClientQuoteDto,
  ) {
    return this.quotesService.sendToClient(id, dto.notes);
  }

  @Permissions('quote.approve-client')
  @Patch(':id/approve-client')
  approveByClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveClientQuoteDto,
  ) {
    return this.quotesService.approveByClient(id, dto.notes);
  }

  @Permissions('quote.reject-client')
  @Patch(':id/reject-client')
  rejectByClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectClientQuoteDto,
  ) {
    return this.quotesService.rejectByClient(id, dto.notes);
  }

  @Permissions('quote.resubmit')
  @Patch(':id/resubmit')
  resubmitQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResubmitQuoteDto,
  ) {
    return this.quotesService.resubmitQuote(id, dto);
  }

  @Permissions('quote.resubmit')
  @Patch(':id/resubmit-after-client-rejection')
  resubmitAfterClientRejection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResubmitQuoteDto,
  ) {
    return this.quotesService.resubmitAfterClientRejection(id, dto);
  }
}
