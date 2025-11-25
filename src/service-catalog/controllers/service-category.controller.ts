import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ServiceCategoryService } from '../services/service-category.service';
import { CreateServiceCategoryDto } from '../dto/create-service-category.dto';
import { UpdateServiceCategoryDto } from '../dto/update-service-category.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { BulkOperationsDto } from 'src/common/dtos/bulk-ids.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)  
@RolesDec('admin')
@Controller('service-categories')
export class ServiceCategoryController {
  constructor(private readonly serviceCategoryService: ServiceCategoryService) {}

  @Permissions('service-category.create')
  @Post()
  create(@Body() createServiceCategoryDto: CreateServiceCategoryDto) {
    return this.serviceCategoryService.create(createServiceCategoryDto);
  }

  @Permissions('service-category.read')
  @Get()
  findAll(@Query() q: any) {
    return this.serviceCategoryService.findAll(q);
  }

  @Permissions('service-category.read')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.serviceCategoryService.findOne(id);
  }

  @Permissions('service-category.restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() bulkOperationsDto: BulkOperationsDto) {
    return this.serviceCategoryService.bulkRestore(bulkOperationsDto.ids);
  }

  @Permissions('service-category.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateServiceCategoryDto: UpdateServiceCategoryDto) {
    return this.serviceCategoryService.update(id, updateServiceCategoryDto);
  }

  @Permissions('service-category.delete')
  @Delete('bulk-delete')
  bulkSoftDelete(@Body() bulkOperationsDto: BulkOperationsDto) {
    return this.serviceCategoryService.bulkSoftDelete(bulkOperationsDto.ids);
  }

  @Permissions('service-category.delete')
  @Delete(':id')
  softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.serviceCategoryService.softDelete(id);
  }

  @Permissions('service-category.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.serviceCategoryService.restore(id);
  }
}
