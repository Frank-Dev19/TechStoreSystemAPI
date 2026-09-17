import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/decorators/roles.decorator';
import {
  DeliveryListQuery,
  DeliveryListService,
} from './delivery-list.service';
import { ManualDeliveryService } from './manual-delivery.service';
import { CreateManualDeliveryDto } from './manual-delivery.dto';

@Controller('service-order-material-deliveries')
@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
export class DeliveryListController {
  constructor(
    private readonly service: DeliveryListService,
    private readonly manual: ManualDeliveryService,
  ) {}
  @Get('technicians')
  @Roles('admin', 'supervisor')
  technicians() {
    return this.service.technicians();
  }
  @Get()
  @Roles('admin', 'supervisor')
  list(@Query() query: DeliveryListQuery) {
    return this.service.list(query);
  }
  @Get('manual/options/:productId')
  @Roles('admin')
  @Permissions('inventory-manage.manage')
  options(@Param('productId', ParseIntPipe) productId: number) {
    return this.manual.options(productId);
  }
  @Post('manual')
  @Roles('admin')
  @Permissions('inventory-manage.manage')
  createManual(
    @Body() dto: CreateManualDeliveryDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.manual.create(dto, Number(req.user.sub));
  }
}
