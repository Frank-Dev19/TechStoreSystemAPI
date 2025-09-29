import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { BulkOperationsDto } from './dto/bulk-operations.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Permissions('customer.create')
  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Permissions('customer.read')
  @Get()
  findAll(@Query() q: any) {
    return this.customersService.findAll(q);
  }

  @Permissions('customer.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(+id);
  }

  @Permissions('customer.bulk-restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() bulkOperationsDto: BulkOperationsDto) {
    return this.customersService.bulkRestore(bulkOperationsDto.ids);
  }

  @Permissions('customer.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(+id, updateCustomerDto);
  }

  @Permissions('customer.bulk-soft-delete')
  @Delete('bulk-soft-delete')
  bulkSoftDelete(@Body() bulkOperationsDto: BulkOperationsDto) {
    return this.customersService.bulkSoftDelete(bulkOperationsDto.ids);
  }

  @Permissions('customer.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(+id);
  }

  @Permissions('customer.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.customersService.restore(+id);
  }

  @Permissions('customer.hard-delete')
  @Delete(':id/hard-delete')
  hardRemove(@Param('id') id: string) {
    return this.customersService.hardRemove(+id);
  }
}
