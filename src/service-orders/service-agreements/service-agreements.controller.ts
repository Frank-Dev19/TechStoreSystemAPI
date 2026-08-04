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
import { ServiceOrderAgreementsService } from './service-agreements.service';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { CreateServiceOrderAgreementDto } from './dto/create-service-agreement.dto';
import { UpdateServiceOrderAgreementDto } from './dto/update-service-agreement.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';
import {
  RECEPTIONIST_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
} from '../../common/constants/role-names';
import { CreateServiceOrderCommercialRevisionDto } from './dto/create-service-order-commercial-revision.dto';
import { ServiceOrderCommercialRevisionService } from './service-order-commercial-revision.service';
import { RecordServiceOrderClientDecisionDto } from './dto/record-service-order-client-decision.dto';
import { ServiceOrderCommercialDecisionService } from './service-order-commercial-decision.service';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin', ...RECEPTIONIST_ROLE_NAMES, ...SUPERVISOR_ROLE_NAMES, ...TECHNICIAN_ROLE_NAMES)
@Controller('service-order-agreements')
export class ServiceOrderAgreementsController {
  constructor(
    private readonly serviceOrderAgreementsService: ServiceOrderAgreementsService,
    private readonly commercialRevisionService: ServiceOrderCommercialRevisionService,
    private readonly commercialDecisionService: ServiceOrderCommercialDecisionService,
  ) {}

  @Permissions('service-order-agreement.read')
  @Get()
  findAll(@Query() query: any) {
    return this.serviceOrderAgreementsService.findAll(query);
  }

  @Permissions('service-order-agreement.read')
  @Get('technician-rankings')
  getTechnicianRevenueRankings() {
    return this.serviceOrderAgreementsService.getTechnicianRevenueRankings();
  }

  @Permissions('service-order-agreement.create')
  @Post('revisions')
  createRevision(@Body() dto: CreateServiceOrderCommercialRevisionDto, @Req() req: any) {
    return this.commercialRevisionService.createRevision(dto, req.user);
  }

  @Permissions('service-order-agreement.record-client-decision')
  @Post('client-decisions')
  recordClientDecision(@Body() dto: RecordServiceOrderClientDecisionDto, @Req() req: any) {
    return this.commercialDecisionService.recordDecision(dto, req.user);
  }

  @Permissions('service-order-agreement.read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Query('withDeleted') withDeleted?: string) {
    return this.serviceOrderAgreementsService.findOne(id, withDeleted === 'true');
  }

  @Permissions('service-order-agreement.create')
  @Post()
  create(@Body() dto: CreateServiceOrderAgreementDto) {
    return this.serviceOrderAgreementsService.create(dto);
  }

  @Permissions('service-order-agreement.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServiceOrderAgreementDto) {
    return this.serviceOrderAgreementsService.update(id, dto);
  }

  @Permissions('service-order-agreement.confirm')
  @Patch(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderAgreementsService.confirm(id);
  }

  @Permissions('service-order-agreement.void')
  @Patch(':id/void')
  voidAgreement(@Param('id', ParseIntPipe) id: number, @Body('notes') notes?: string) {
    return this.serviceOrderAgreementsService.void(id, notes);
  }

  @Permissions('service-order-agreement.create')
  @Post('diagnosis-fee-auto')
  createDiagnosisFeeAgreement(@Body('serviceOrderId', ParseIntPipe) serviceOrderId: number) {
    return this.serviceOrderAgreementsService.createDiagnosisFeeAgreement(serviceOrderId);
  }

  @Permissions('service-order-agreement.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderAgreementsService.softDelete(id);
  }

  @Permissions('service-order-agreement.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceOrderAgreementsService.restore(id);
  }

  @Permissions('service-order-agreement.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderAgreementsService.bulkSoftDelete(dto.ids);
  }

  @Permissions('service-order-agreement.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.serviceOrderAgreementsService.bulkRestore(dto.ids);
  }
}


