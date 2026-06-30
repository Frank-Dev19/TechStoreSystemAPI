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
  Req,
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
  findAll(@Query() query: any, @Req() req: any) {
    return this.serviceOrderDiagnosisService.findAll(query, req.user);
  }

  @Permissions('service-order-diagnosis.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
    @Req() req?: any,
  ) {
    return this.serviceOrderDiagnosisService.findOne(id, withDeleted === 'true', req?.user);
  }

  @Permissions('service-order-diagnosis.create')
  @Post()
  create(@Body() dto: CreateServiceOrderDiagnosisDto, @Req() req: any) {
    return this.serviceOrderDiagnosisService.create(dto, req.user);
  }

  @Permissions('service-order-diagnosis.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceOrderDiagnosisDto, @Req() req: any) {
    return this.serviceOrderDiagnosisService.update(id, dto, req.user);
  }

  @Permissions('service-order-diagnosis.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.serviceOrderDiagnosisService.softDelete(id, req.user);
  }

  @Permissions('service-order-diagnosis.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.serviceOrderDiagnosisService.restore(id, req.user);
  }

  @Permissions('service-order-diagnosis.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto, @Req() req: any) {
    return this.serviceOrderDiagnosisService.bulkSoftDelete(dto.ids, req.user);
  }

  @Permissions('service-order-diagnosis.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto, @Req() req: any) {
    return this.serviceOrderDiagnosisService.bulkRestore(dto.ids, req.user);
  }
}
