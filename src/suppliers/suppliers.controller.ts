import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Permissions('supplier.create')
  @Post()
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.suppliersService.create(createSupplierDto);
  }

  @Permissions('supplier.read')
  @Get()
  findAll(@Query() q: any) {
    return this.suppliersService.findAll(q);
  }

  @Permissions('supplier.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(+id);
  }

  @Permissions('supplier.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSupplierDto: UpdateSupplierDto) {
    return this.suppliersService.update(+id, updateSupplierDto);
  }

  @Permissions('supplier.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(+id);
  }

  @Permissions('supplier.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.suppliersService.restore(+id);
  }

  @Permissions('supplier.hard-remove')
  @Delete(':id/hard-remove')
  hardRemove(@Param('id') id: string) {
    return this.suppliersService.hardRemove(+id);
  } 
}
