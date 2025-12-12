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
import { DiagnosticsService } from './diagnostics.service';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import {
  RECEPTIONIST_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
} from '../../common/constants/role-names';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Permissions('diagnostic.read')
  @Get()
  findAll(@Query() query: any) {
    return this.diagnosticsService.findAll(query);
  }

  @Permissions('diagnostic.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.diagnosticsService.findOne(id, withDeleted === 'true');
  }

  @Permissions('diagnostic.create')
  @Post()
  create(@Body() dto: CreateDiagnosisDto) {
    return this.diagnosticsService.create(dto);
  }

  @Permissions('diagnostic.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDiagnosisDto) {
    return this.diagnosticsService.update(id, dto);
  }

  @Permissions('diagnostic.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosticsService.softDelete(id);
  }

  @Permissions('diagnostic.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.diagnosticsService.restore(id);
  }

  @Permissions('diagnostic.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.diagnosticsService.bulkSoftDelete(dto.ids);
  }

  @Permissions('diagnostic.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.diagnosticsService.bulkRestore(dto.ids);
  }
}
