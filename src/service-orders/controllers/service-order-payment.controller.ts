import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RECEPTIONIST_ROLE_NAMES, SUPERVISOR_ROLE_NAMES } from '../../common/constants/role-names';
import { CreateServiceOrderPaymentDto } from '../dto/create-service-order-payment.dto';
import { ServiceOrderPaymentService } from '../services/service-order-payment.service';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES)
@Controller('service-order-payments')
export class ServiceOrderPaymentController {
  constructor(private readonly paymentService: ServiceOrderPaymentService) {}

  @Permissions('service-order-payment.read')
  @Get()
  findAll(@Query('serviceOrderId') serviceOrderId?: string) {
    return this.paymentService.findAll(serviceOrderId ? Number(serviceOrderId) : undefined);
  }

  @Permissions('service-order-payment.create')
  @Post(':serviceOrderId')
  create(
    @Param('serviceOrderId', ParseIntPipe) serviceOrderId: number,
    @Body() dto: CreateServiceOrderPaymentDto,
    @CurrentUser() actorId?: number,
  ) {
    return this.paymentService.create(serviceOrderId, dto, actorId);
  }
}
