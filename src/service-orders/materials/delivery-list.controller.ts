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
import {
  DeliveryListQuery,
  DeliveryListService,
} from './delivery-list.service';
import { ManualDeliveryService } from './manual-delivery.service';
import { CreateManualDeliveryDto } from './manual-delivery.dto';

@Controller('service-order-material-deliveries')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DeliveryListController {
  constructor(
    private readonly service: DeliveryListService,
    private readonly manual: ManualDeliveryService,
  ) {}
  @Get('technicians')
  @Permissions('internal-deliveries.read')
  technicians() {
    return this.service.technicians();
  }
  @Get()
  @Permissions('internal-deliveries.read')
  list(@Query() query: DeliveryListQuery) {
    return this.service.list(query);
  }
  @Get('manual/options/:productId')
  @Permissions('internal-deliveries.create')
  options(@Param('productId', ParseIntPipe) productId: number) {
    return this.manual.options(productId);
  }
  @Post('manual')
  @Permissions('internal-deliveries.create')
  createManual(
    @Body() dto: CreateManualDeliveryDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.manual.create(dto, Number(req.user.sub));
  }
}
