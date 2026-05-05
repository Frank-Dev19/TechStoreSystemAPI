import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceOrderService } from '../services/service-order.service';
import { CreateServiceOrderBatchDto } from '../dto/create-service-order-batch.dto';
import { CreateServiceOrderDto } from '../dto/create-service-order.dto';
import { UpdateServiceOrderDto } from '../dto/update-service-order.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { RECEPTIONIST_ROLE_NAMES, SUPERVISOR_ROLE_NAMES, TECHNICIAN_ROLE_NAMES } from '../../common/constants/role-names';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { AssignTechnicianDto } from '../dto/assign-technician.dto';
import { ServiceOrderTechnicalStatus } from '../enums';
import { ServiceOrderTechnicianSuggestionDto } from '../dto/service-order-technician-suggestion.dto';
import { LinkSaleToServiceOrdersDto } from '../dto/link-sale-to-service-orders.dto';
import { ServiceOrderSaleLinkService } from '../services/service-order-sale-link.service';
import { TransitionServiceOrderTechnicalDto } from '../dto/transition-service-order-technical.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
@Controller('service-orders')
export class ServiceOrderController {
  constructor(
    private readonly serviceOrderService: ServiceOrderService,
    private readonly workflowService: ServiceOrderWorkflowService,
    private readonly saleLinkService: ServiceOrderSaleLinkService,
  ) {}

  @Permissions('service-order.create')
  @Post()
  create(@Body() dto: CreateServiceOrderDto, @CurrentUser() userId?: number) {
    if (!userId) {
      throw new BadRequestException('Usuario autenticado no encontrado');
    }
    return this.serviceOrderService.create(dto, userId);
  }

  @Permissions('service-order.create')
  @Post('batch')
  createBatch(@Body() dto: CreateServiceOrderBatchDto, @CurrentUser() userId?: number) {
    if (!userId) {
      throw new BadRequestException('Usuario autenticado no encontrado');
    }
    return this.serviceOrderService.createBatch(dto, userId);
  }

  @Permissions('service-order.read')
  @Get()
  findAll(@Query() query: any) {
    return this.serviceOrderService.findAll(query);
  }

  @Permissions('service-order.read')
  @Get('technician-suggestion')
  getTechnicianSuggestion(@Query() query: ServiceOrderTechnicianSuggestionDto) {
    return this.workflowService.getAssignmentSuggestion(query.serviceType);
  }

  @Permissions('service-order.read')
  @Get('backoffice/billing-links/search-sales')
  searchSales(@Query() query: any) {
    return this.saleLinkService.searchSales(query);
  }

  @Permissions('service-order.read')
  @Get('backoffice/billing-links/by-orders')
  getLinksByOrders(@Query('serviceOrderIds') serviceOrderIds?: string) {
    const ids = String(serviceOrderIds ?? '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    return this.saleLinkService.getLinksByServiceOrderIds(ids);
  }

  @Permissions('service-order.update')
  @Post('backoffice/billing-links')
  linkSaleToOrders(@Body() dto: LinkSaleToServiceOrdersDto, @CurrentUser() userId?: number) {
    return this.saleLinkService.linkSaleToServiceOrders(dto, userId ? String(userId) : undefined);
  }

  @Permissions('service-order.update')
  @Delete('backoffice/billing-links/:id')
  unlinkSale(@Param('id', ParseIntPipe) id: number) {
    return this.saleLinkService.unlink(id);
  }

  @Permissions('service-order.read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderService.findOne(id);
  }

  @Permissions('service-order.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceOrderDto) {
    return this.serviceOrderService.update(id, dto);
  }

  @Permissions('service-order.update')
  @Patch(':id/deliver')
  deliver(@Param('id', ParseIntPipe) id: number, @CurrentUser() userId?: number) {
    return this.serviceOrderService.markAsDelivered(id, userId);
  }

  @Permissions('service-order.update')
  @Patch(':id/assign-technician')
  assignTechnician(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTechnicianDto,
    @CurrentUser() userId?: number,
  ) {
    return this.workflowService.assignTechnician(id, dto, userId);
  }

  @Permissions('service-order.update')
  @Patch(':id/technical/:status')
  changeTechnicalStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status', new ParseEnumPipe(ServiceOrderTechnicalStatus)) status: ServiceOrderTechnicalStatus,
    @Body() dto?: TransitionServiceOrderTechnicalDto,
    @CurrentUser() userId?: number,
  ) {
    return this.workflowService.changeTechnicalStatus(id, status, userId, dto?.reason);
  }

  @Permissions('service-order.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderService.softDelete(id);
  }

  @Permissions('service-order.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderService.restore(id);
  }

  @Permissions('service-order.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderService.bulkSoftDelete(dto.ids);
  }

  @Permissions('service-order.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderService.bulkRestore(dto.ids);
  }
}
