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
import { ServiceOrderItemService } from '../services/service-order-item.service';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { AssignTechnicianDto } from '../dto/assign-technician.dto';
import { RequestRediagnosisDto } from '../dto/request-rediagnosis.dto';
import { ServiceOrderItemStatus } from '../enums';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import {
  RECEPTIONIST_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
} from '../../common/constants/role-names';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
@Controller('service-order-items')
export class ServiceOrderItemController {
  constructor(private readonly serviceOrderItemService: ServiceOrderItemService) {}

  @Permissions('service-order.read')
  @Get()
  findAll(@Query() query: any, @CurrentUser() userId?: number) {
    return this.serviceOrderItemService.findAll(query, userId);
  }

  @Permissions('service-order.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.serviceOrderItemService.findOne(id, withDeleted === 'true');
  }

  @Permissions('service-order.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderItemService.softDelete(id);
  }

  @Permissions('service-order.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderItemService.restore(id);
  }

  @Permissions('service-order.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderItemService.bulkSoftDelete(dto.ids);
  }

  @Permissions('service-order.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderItemService.bulkRestore(dto.ids);
  }

  @Permissions('service-order.update')
  @Patch(':itemId/assign-technician')
  assignTechnician(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.serviceOrderItemService.assignTechnician(itemId, dto.technicianId);
  }

  @Permissions('service-order.update')
  @Patch(':itemId/status/:status')
  changeStatus(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('status') status: ServiceOrderItemStatus,
    @CurrentUser() userId?: number,
  ) {
    return this.serviceOrderItemService.changeStatus(itemId, status, userId);
  }

  @Permissions('service-order.update')
  @Patch(':itemId/request-rediagnosis')
  requestRediagnosis(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: RequestRediagnosisDto,
    @CurrentUser() userId?: number,
  ) {
    return this.serviceOrderItemService.requestRediagnosis(itemId, dto.reason, userId);
  }
}
