import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TicketItemService } from '../services/ticket-item.service';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { AssignTicketItemDto } from '../dto/assign-ticket-item.dto';
import { TicketItemStatus } from '../enums';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('ticket/items')
export class TicketItemController {
  constructor(private readonly ticketItemService: TicketItemService) {}

  @Permissions('ticket-item.read')
  @Get()
  findAll(@Query() query: any, @CurrentUser() userId?: number) {
    return this.ticketItemService.findAll(query, userId);
  }

  @Permissions('ticket-item.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.ticketItemService.findOne(id, withDeleted === 'true');
  }

  @Permissions('ticket-item.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ticketItemService.softDelete(id);
  }

  @Permissions('ticket-item.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.ticketItemService.restore(id);
  }

  @Permissions('ticket-item.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.ticketItemService.bulkSoftDelete(dto.ids);
  }

  @Permissions('ticket-item.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.ticketItemService.bulkRestore(dto.ids);
  }

  @Permissions('ticket-item.assign')
  @Patch(':itemId/assign')
  assign(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: AssignTicketItemDto,
  ) {
    return this.ticketItemService.assignTechnician(itemId, dto.technicianId);
  }

  @Permissions('ticket-item.update-status')
  @Patch(':itemId/status/:status')
  changeStatus(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('status') status: TicketItemStatus,
  ) {
    return this.ticketItemService.changeStatus(itemId, status);
  }
}
