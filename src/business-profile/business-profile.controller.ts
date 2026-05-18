import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { BusinessProfileService } from './business-profile.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('business-profile')
export class BusinessProfileController {
  constructor(private readonly service: BusinessProfileService) {}

  @Permissions('business-profile.read')
  @Get()
  findCurrent() {
    return this.service.findCurrent();
  }

  @Permissions('business-profile.update')
  @Put()
  update(@Body() dto: UpdateBusinessProfileDto) {
    return this.service.upsert(dto);
  }
}
