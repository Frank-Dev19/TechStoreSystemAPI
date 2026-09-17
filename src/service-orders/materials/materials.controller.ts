import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { Roles } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { MaterialsService } from './materials.service';
import {
  MaterialIssueDto,
  MaterialReconcileDto,
  MaterialReturnDto,
  MaterialReviewDto,
} from './material.dto';

@Controller('service-orders/:orderId/items/:itemId/materials')
@UseGuards(JwtAccessGuard, PermissionsGuard, RolesGuard)
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}
  @Get()
  @Permissions('service-order.read')
  read(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.read(orderId, itemId, Number(req.user.sub));
  }
  @Get('available/:productId')
  @Permissions('inventory-manage.manage')
  available(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.available(
      orderId,
      itemId,
      productId,
      Number(req.user.sub),
    );
  }
  @Post('deliveries')
  @Permissions('inventory-manage.manage')
  issue(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: MaterialIssueDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.issue(orderId, itemId, dto, Number(req.user.sub));
  }
  @Post('returns')
  @Permissions('inventory-manage.manage')
  returnMaterial(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: MaterialReturnDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.returnMaterial(
      orderId,
      itemId,
      dto,
      Number(req.user.sub),
    );
  }
  @Post('reconcile')
  @Permissions('service-order.update')
  reconcile(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: MaterialReconcileDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.reconcile(orderId, itemId, dto, Number(req.user.sub));
  }
  @Post('serials/:serialId/review')
  @Roles('admin')
  @Permissions('inventory-manage.manage')
  review(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('serialId', ParseIntPipe) serialId: number,
    @Body() dto: MaterialReviewDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.review(
      orderId,
      itemId,
      serialId,
      dto,
      Number(req.user.sub),
    );
  }
}
