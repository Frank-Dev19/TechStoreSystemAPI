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
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import {
  CreateInternalSupplyRequestDto,
  FulfillDispatchRequestDto,
  FulfillExternalReplacementDto,
  RejectDispatchRequestDto,
} from './dispatch-request.dto';
import { DispatchRequestService } from './dispatch-request.service';

@Controller('dispatches')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DispatchRequestController {
  constructor(private readonly service: DispatchRequestService) {}

  @Post('requests/internal')
  @Permissions('dispatches.request-internal')
  createInternal(
    @Body() dto: CreateInternalSupplyRequestDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.createInternal(dto, Number(req.user.sub));
  }

  @Get('requests/mine')
  @Permissions('dispatches.read-own')
  mine(
    @Query() query: Record<string, string>,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.list(query, Number(req.user.sub));
  }

  @Get('history/mine')
  @Permissions('dispatches.read-own')
  history(
    @Query() query: Record<string, string>,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.listTechnicianHistory(query, Number(req.user.sub));
  }

  @Get('queue')
  @Permissions('dispatches.read')
  queue(@Query() query: Record<string, string>) {
    return this.service.list(query);
  }

  @Get('summary')
  @Permissions('dispatches.read')
  summary() {
    return this.service.summary();
  }

  @Get('options/:productId')
  @Permissions('dispatches.fulfill')
  options(@Param('productId', ParseIntPipe) productId: number) {
    return this.service.options(productId);
  }

  @Post('requests/:id/fulfill')
  @Permissions('dispatches.fulfill')
  fulfill(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FulfillDispatchRequestDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.fulfill(id, dto, Number(req.user.sub));
  }

  @Post('requests/:id/fulfill-external')
  @Permissions('dispatches.fulfill-external')
  fulfillExternal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FulfillExternalReplacementDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.fulfillExternalReplacement(
      id,
      dto,
      Number(req.user.sub),
    );
  }

  @Post('requests/:id/reject')
  @Permissions('dispatches.reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDispatchRequestDto,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.reject(id, dto.reason, Number(req.user.sub));
  }

  @Post('requests/:id/confirm')
  @Permissions('dispatches.confirm-replacement')
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: { sub: number } },
  ) {
    return this.service.confirmReplacement(id, Number(req.user.sub));
  }
}
