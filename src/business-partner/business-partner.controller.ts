import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { BusinessPartnerService } from './business-partner.service';
import { CreateBusinessPartnerDto } from './dto/create-business-partner.dto';
import { UpdateBusinessPartnerDto } from './dto/update-business-partner.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { BulkSoftDeleteBusinessPartnerDto } from './dto/bulk-soft-delete-business-partner.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('business-partners')
export class BusinessPartnerController {
  constructor(private readonly businessPartnerService: BusinessPartnerService) {}

  @Permissions('business-partner.create')
  @Post()
  create(@Body() createBusinessPartnerDto: CreateBusinessPartnerDto) {
    return this.businessPartnerService.create(createBusinessPartnerDto);
  }

  @Permissions('business-partner.read')
  @Get()
  findAll(@Query() q: any) {
    return this.businessPartnerService.findAll(q);
  }

  @Permissions('business-partner.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businessPartnerService.findOne(+id);
  }

  @Permissions('business-partner.bulk-restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() bulkSoftDeleteBusinessPartnerDto: BulkSoftDeleteBusinessPartnerDto) {
    return this.businessPartnerService.bulkRestore(bulkSoftDeleteBusinessPartnerDto.ids);
  }

  @Permissions('business-partner.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBusinessPartnerDto: UpdateBusinessPartnerDto) {
    return this.businessPartnerService.update(+id, updateBusinessPartnerDto);
  }

  @Permissions('business-partner.bulk-delete')
  @Delete('bulk-delete')
  bulkSoftDelete(@Body() bulkSoftDeleteBusinessPartnerDto: BulkSoftDeleteBusinessPartnerDto) {
    return this.businessPartnerService.bulkSoftDelete(bulkSoftDeleteBusinessPartnerDto.ids);
  }

  @Permissions('business-partner.soft-delete')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.businessPartnerService.softDelete(+id);
  }

  @Permissions('business-partner.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.businessPartnerService.restore(+id);
  }  
}
