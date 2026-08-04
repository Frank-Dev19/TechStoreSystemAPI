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
  Res,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ServiceOrderService } from '../services/service-order.service';
import { CreateServiceOrderAggregateDto } from '../dto/create-service-order-aggregate.dto';
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
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { ServiceOrderAggregateService } from '../services/service-order-aggregate.service';
import { ServiceOrderItemWorkflowService } from '../services/service-order-item-workflow.service';
import { ServiceOrderItemCancellationService } from '../services/service-order-item-cancellation.service';
import { ServiceOrderItemDeliveryService } from '../services/service-order-item-delivery.service';
import { RequestServiceOrderItemCancellationDto } from '../dto/request-service-order-item-cancellation.dto';
import { ResolveServiceOrderItemCancellationDto } from '../dto/resolve-service-order-item-cancellation.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
@Controller('service-orders')
export class ServiceOrderController {
  constructor(
    private readonly serviceOrderService: ServiceOrderService,
    private readonly aggregateService: ServiceOrderAggregateService,
    private readonly itemWorkflowService: ServiceOrderItemWorkflowService,
    private readonly itemCancellationService: ServiceOrderItemCancellationService,
    private readonly itemDeliveryService: ServiceOrderItemDeliveryService,
    private readonly workflowService: ServiceOrderWorkflowService,
    private readonly saleLinkService: ServiceOrderSaleLinkService,
    private readonly inboxService: ServiceOrderInboxService,
  ) {}

  @Permissions('service-order.create')
  @Post()
  create(@Body() dto: CreateServiceOrderAggregateDto, @CurrentUser() userId?: number) {
    if (!userId) {
      throw new BadRequestException('Usuario autenticado no encontrado');
    }
    return this.aggregateService.create(dto, userId);
  }

  @Permissions('service-order.read')
  @Get()
  findAll(@Query() query: any, @Req() req: any) {
    return this.serviceOrderService.findAll(query, req.user);
  }

  @Permissions('service-order.assign')
  @Get('technician-suggestion')
  getTechnicianSuggestion(@Query() query: ServiceOrderTechnicianSuggestionDto) {
    return this.workflowService.getAssignmentSuggestion(query.serviceType);
  }

  @Permissions('service-order.billing-link')
  @Get('backoffice/billing-links/search-sales')
  searchSales(@Query() query: any) {
    return this.saleLinkService.searchSales(query);
  }

  @Permissions('service-order.billing-link')
  @Get('backoffice/billing-links/by-orders')
  getLinksByOrders(@Query('serviceOrderIds') serviceOrderIds?: string) {
    const ids = String(serviceOrderIds ?? '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    return this.saleLinkService.getLinksByServiceOrderIds(ids);
  }

  @Permissions('service-order.billing-link')
  @Post('backoffice/billing-links')
  linkSaleToOrders(@Body() dto: LinkSaleToServiceOrdersDto, @CurrentUser() userId?: number) {
    return this.saleLinkService.linkSaleToServiceOrders(dto, userId ? String(userId) : undefined);
  }

  @Permissions('service-order.billing-link')
  @Delete('backoffice/billing-links/:id')
  unlinkSale(@Param('id', ParseIntPipe) id: number) {
    return this.saleLinkService.unlink(id);
  }

  @Permissions('service-order.read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.serviceOrderService.findOne(id, false, req.user);
  }

  @Permissions('service-order.read')
  @Get(':id/summary-pdf')
  async downloadSummaryPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.serviceOrderService.generateSingleOrderSummaryPdf(id, req.user);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return new StreamableFile(result.buffer);
  }

  @Permissions('service-order.read')
  @Get(':id/inbox-thread')
  getInboxThread(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inboxService.getThreadForServiceOrder(id, this.inboxService.buildViewerContext(req.user));
  }

  @Permissions('service-order.edit')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceOrderDto, @Req() req: any) {
    return this.serviceOrderService.update(id, dto, req.user);
  }

  @Permissions('service-order.deliver')
  @Patch(':id/deliver')
  deliver(@Param('id', ParseIntPipe) id: number, @CurrentUser() userId?: number, @Req() req?: any) {
    return this.itemDeliveryService.deliverOnlyItem(id, userId, req?.user);
  }

  @Permissions('service-order.item-deliver')
  @Patch(':id/items/:itemId/deliver')
  deliverItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() userId?: number,
    @Req() req?: any,
  ) {
    return this.itemDeliveryService.deliverItem(id, itemId, userId, req?.user);
  }

  @Permissions('service-order.assign')
  @Patch(':id/assign-technician')
  assignTechnician(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTechnicianDto,
    @CurrentUser() userId?: number,
    @Req() req?: any,
  ) {
    return this.workflowService.assignTechnician(id, dto, userId, req?.user);
  }

  @Permissions('service-order.item-transition')
  @Patch(':id/items/:itemId/technical/:status')
  changeItemTechnicalStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('status', new ParseEnumPipe(ServiceOrderTechnicalStatus)) status: ServiceOrderTechnicalStatus,
    @Body() dto?: TransitionServiceOrderTechnicalDto,
    @CurrentUser() userId?: number,
    @Req() req?: any,
  ) {
    return this.itemWorkflowService.changeTechnicalStatus(id, itemId, status, userId, dto?.reason, req?.user);
  }

  @Permissions('service-order.item-cancel')
  @Post(':id/items/:itemId/cancellations')
  requestItemCancellation(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: RequestServiceOrderItemCancellationDto,
    @CurrentUser() userId?: number,
    @Req() req?: any,
  ) {
    return this.itemCancellationService.requestCancellation(id, itemId, dto, userId, req?.user);
  }

  @Permissions('service-order.item-cancel-after-start')
  @Patch(':id/items/:itemId/cancellations/:requestId/resolve')
  resolveItemCancellation(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ResolveServiceOrderItemCancellationDto,
    @CurrentUser() userId?: number,
    @Req() req?: any,
  ) {
    return this.itemCancellationService.resolveCancellation(id, itemId, requestId, dto, userId, req?.user);
  }

  @Permissions('service-order.transition')
  @Patch(':id/technical/:status')
  changeTechnicalStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status', new ParseEnumPipe(ServiceOrderTechnicalStatus)) status: ServiceOrderTechnicalStatus,
    @Body() dto?: TransitionServiceOrderTechnicalDto,
    @CurrentUser() userId?: number,
    @Req() req?: any,
  ) {
    return this.workflowService.changeTechnicalStatus(id, status, userId, dto?.reason, req?.user);
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
