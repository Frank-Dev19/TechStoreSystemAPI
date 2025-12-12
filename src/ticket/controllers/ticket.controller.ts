import {
  BadRequestException,
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
import { TicketService } from '../services/ticket.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { RECEPTIONIST_ROLE_NAMES, SUPERVISOR_ROLE_NAMES } from '../../common/constants/role-names';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES)
@Controller('ticket')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Permissions('ticket.create')
  @Post()
  create(@Body() createTicketDto: CreateTicketDto, @CurrentUser() userId?: number) {
    if (!userId) {
      throw new BadRequestException('Usuario autenticado no encontrado');
    }
    return this.ticketService.create(createTicketDto, userId);
  }

  @Permissions('ticket.read')
  @Get()
  findAll(@Query() query: any) {
    return this.ticketService.findAll(query);
  }

  @Permissions('ticket.read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ticketService.findOne(id);
  }

  @Permissions('ticket.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateTicketDto: UpdateTicketDto) {
    return this.ticketService.update(id, updateTicketDto);
  }

  @Permissions('ticket.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ticketService.softDelete(id);
  }

  @Permissions('ticket.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.ticketService.restore(id);
  }

  @Permissions('ticket.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.ticketService.bulkSoftDelete(dto.ids);
  }

  @Permissions('ticket.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.ticketService.bulkRestore(dto.ids);
  }
}
