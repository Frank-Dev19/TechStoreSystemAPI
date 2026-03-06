import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceOrderDiagnosisService } from './service-order-diagnosis.service';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { CreateServiceOrderDiagnosisDto } from './dto/create-service-order-diagnosis.dto';
import { UpdateServiceOrderDiagnosisDto } from './dto/update-service-order-diagnosis.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import {
  RECEPTIONIST_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
} from '../../common/constants/role-names';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
@Controller('service-order-diagnoses')
export class ServiceOrderDiagnosisController {
  constructor(private readonly serviceOrderDiagnosisService: ServiceOrderDiagnosisService) {}

  @Permissions('service-order-diagnosis.read')
  @Get()
  findAll(@Query() query: any) {
    return this.serviceOrderDiagnosisService.findAll(query);
  }

  @Permissions('service-order-diagnosis.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.serviceOrderDiagnosisService.findOne(id, withDeleted === 'true');
  }

  @Permissions('service-order-diagnosis.create')
  @Post()
  create(@Body() dto: CreateServiceOrderDiagnosisDto) {
    return this.serviceOrderDiagnosisService.create(dto);
  }

  @Permissions('service-order-diagnosis.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceOrderDiagnosisDto) {
    return this.serviceOrderDiagnosisService.update(id, dto);
  }

  @Permissions('service-order-diagnosis.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderDiagnosisService.softDelete(id);
  }

  @Permissions('service-order-diagnosis.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderDiagnosisService.restore(id);
  }

  @Permissions('service-order-diagnosis.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderDiagnosisService.bulkSoftDelete(dto.ids);
  }

  @Permissions('service-order-diagnosis.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderDiagnosisService.bulkRestore(dto.ids);
  }
}
