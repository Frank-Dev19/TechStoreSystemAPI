import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
import { ServiceOrderInboxChannelService } from './service-order-inbox-channel.service';
import { ServiceOrderInboxService } from './service-order-inbox.service';
import { ServiceOrderInboxQueryDto } from './dto/service-order-inbox-query.dto';
import { SendServiceOrderInboxMessageDto } from './dto/send-service-order-inbox-message.dto';

@Controller('service-orders/inbox')
export class ServiceOrderInboxController {
  constructor(
    private readonly inboxService: ServiceOrderInboxService,
    private readonly channelService: ServiceOrderInboxChannelService,
  ) {}

  @UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
  @RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
  @Permissions('service-order-inbox.read')
  @Get('threads')
  listThreads(@Query() query: ServiceOrderInboxQueryDto, @Req() req: any) {
    return this.inboxService.listThreads(query, this.inboxService.buildViewerContext(req.user));
  }

  @UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
  @RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
  @Permissions('service-order-inbox.read')
  @Get('threads/:id/messages')
  getMessages(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inboxService.getMessages(id, this.inboxService.buildViewerContext(req.user));
  }

  @UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
  @RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
  @Permissions('service-order-inbox.read')
  @Post('threads/:id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.inboxService.markThreadAsRead(id, this.inboxService.buildViewerContext(req.user));
  }

  @UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
  @RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
  @Permissions('service-order-inbox.send')
  @Post('threads/:id/messages')
  @UseInterceptors(FilesInterceptor('attachments', 5))
  sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendServiceOrderInboxMessageDto,
    @UploadedFiles() files: Array<Record<string, any>>,
    @Req() req: any,
  ) {
    return this.inboxService.sendMessage(
      id,
      dto,
      (files ?? []) as Array<{ originalname: string; mimetype: string; size: number; buffer: Buffer }>,
      this.inboxService.buildViewerContext(req.user),
    );
  }

  @UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
  @RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
  @Permissions('service-order-inbox.read')
  @Get('attachments/:id/download')
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const file = await this.inboxService.downloadAttachment(id, this.inboxService.buildViewerContext(req.user));
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);

    return res.sendFile(file.absolutePath);
  }

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    return res.status(200).send(this.channelService.verifyWebhookChallenge(mode, verifyToken, challenge));
  }

  @Post('webhook')
  async receiveWebhook(
    @Body() payload: Record<string, any>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: any,
  ) {
    this.channelService.assertWebhookSignature(req.rawBody as Buffer | undefined, signature);
    const normalizedPayload = this.channelService.normalizeWebhookPayload(payload);

    for (const message of normalizedPayload.messages) {
      await this.inboxService.receiveInboundMessage(message);
    }

    for (const status of normalizedPayload.statuses) {
      await this.inboxService.updateDeliveryStatus(status);
    }

    return {
      ok: true,
      receivedMessages: normalizedPayload.messages.length,
      receivedStatuses: normalizedPayload.statuses.length,
    };
  }
}
