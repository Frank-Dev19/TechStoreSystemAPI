import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import {
  ADMIN_ROLE_NAMES,
  RECEPTIONIST_ROLE_NAMES,
} from '../common/constants/role-names';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { Roles } from '../rbac/decorators/roles.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { CancelWarrantyClaimDto } from './dto/cancel-warranty-claim.dto';
import {
  FilterWarrantyClaimsDto,
  FilterWarrantiesDto,
  WarrantyTechnicianReportDto,
} from './dto/filter-warranties.dto';
import { WarrantiesService } from './warranties.service';

@Controller('warranties')
@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@Roles(...ADMIN_ROLE_NAMES, ...RECEPTIONIST_ROLE_NAMES)
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Get('coverages')
  @Permissions('warranties.read')
  findCoverages(@Query() filter: FilterWarrantiesDto) {
    return this.warrantiesService.findCoverages(filter);
  }

  @Get('coverage-groups')
  @Permissions('warranties.read')
  findCoverageGroups(@Query() filter: FilterWarrantiesDto) {
    return this.warrantiesService.findCoverageGroups(filter);
  }

  @Get('claims')
  @Permissions('warranties.read')
  findClaims(@Query() filter: FilterWarrantyClaimsDto) {
    return this.warrantiesService.findClaims(filter);
  }

  @Patch('claims/:id/cancel')
  @Permissions('warranties.cancel')
  cancelClaim(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelWarrantyClaimDto,
    @CurrentUser() actorId: number,
  ) {
    return this.warrantiesService.cancelClaim(id, actorId, dto.reason);
  }

  @Get('reports/technicians')
  @Roles(...ADMIN_ROLE_NAMES)
  @Permissions('warranties.report')
  technicianReport(@Query() filter: WarrantyTechnicianReportDto) {
    return this.warrantiesService.getTechnicianReport(filter);
  }
}
