import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { BulkIdsDto } from 'src/common/dtos/bulk-ids.dto';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { CreateSupplierDto } from './create-supplier.dto';
import { SupplierService } from './supplier.service';
import { UpdateSupplierDto } from './update-supplier.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Permissions('suppliers.create')
  @Post()
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.supplierService.create(createSupplierDto);
  }

  @Permissions('suppliers.read')
  @Get()
  findAll(@Query() q: any) {
    return this.supplierService.findAll(q);
  }

  @Permissions('suppliers.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.supplierService.findOne(+id);
  }

  @Permissions('suppliers.restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() dto: BulkIdsDto) {
    return this.supplierService.bulkRestore(dto.ids);
  }

  @Permissions('suppliers.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSupplierDto: UpdateSupplierDto) {
    return this.supplierService.update(+id, updateSupplierDto);
  }

  @Permissions('suppliers.delete')
  @Delete('bulk-delete')
  bulkSoftDelete(@Body() dto: BulkIdsDto) {
    return this.supplierService.bulkSoftDelete(dto.ids);
  }

  @Permissions('suppliers.delete')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.supplierService.softDelete(+id);
  }

  @Permissions('suppliers.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.supplierService.restore(+id);
  }
}
