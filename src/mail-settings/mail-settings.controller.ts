import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { TestMailSettingDto } from './dto/test-mail-setting.dto';
import { UpdateMailSettingDto } from './dto/update-mail-setting.dto';
import { MailPurpose } from './enums/mail-purpose.enum';
import { MailSettingsService } from './mail-settings.service';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('mail-settings')
export class MailSettingsController {
  constructor(private readonly service: MailSettingsService) {}

  @Permissions('mail-settings.read')
  @Get()
  findAll() {
    return this.service.findAllForAdmin();
  }

  @Permissions('mail-settings.update')
  @Put(':purpose')
  update(
    @Param('purpose', new ParseEnumPipe(MailPurpose)) purpose: MailPurpose,
    @Body() dto: UpdateMailSettingDto,
  ) {
    return this.service.upsert(purpose, dto);
  }

  @Permissions('mail-settings.test')
  @Post(':purpose/test')
  test(
    @Param('purpose', new ParseEnumPipe(MailPurpose)) purpose: MailPurpose,
    @Body() dto: TestMailSettingDto,
  ) {
    return this.service.test(purpose, dto.recipient);
  }
}

