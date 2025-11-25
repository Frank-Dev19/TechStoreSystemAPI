import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ServiceService } from '../services/service.service';
import { CreateServiceDto } from '../dto/create-service.dto';
import { UpdateServiceDto } from '../dto/update-service.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { BulkOperationsDto } from 'src/common/dtos/bulk-ids.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)  
@RolesDec('admin')
@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Permissions('service.create')
  @Post()
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.serviceService.create(createServiceDto);
  }

  @Permissions('service.read')
  @Get()
  findAll(@Query() q: any) {
    return this.serviceService.findAll(q);
  }

  @Permissions('service.read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.serviceService.findOne(id);
  }

  @Permissions('service.restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() bulkOperationsDto: BulkOperationsDto) {
    return this.serviceService.bulkRestore(bulkOperationsDto.ids);
  }

  @Permissions('service.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateServiceDto: UpdateServiceDto) {
    return this.serviceService.update(id, updateServiceDto);
  }

  @Permissions('service.delete')
  @Delete('bulk-delete')
  bulkSoftDelete(@Body() bulkOperationsDto: BulkOperationsDto) {
    return this.serviceService.bulkSoftDelete(bulkOperationsDto.ids);
  }

  @Permissions('service.delete')
  @Delete(':id')
  softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.serviceService.softDelete(id);
  }

  @Permissions('service.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceService.restore(id);
  }
}
