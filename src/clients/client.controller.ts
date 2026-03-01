import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { BulkSoftDeleteClientDto } from './bulk-soft-delete-client.dto';
import { ClientService } from './client.service';
import { CreateClientDto } from './create-client.dto';
import { UpdateClientDto } from './update-client.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Permissions('clients.create')
  @Post()
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientService.create(createClientDto);
  }

  @Permissions('clients.read')
  @Get()
  findAll(@Query() q: any) {
    return this.clientService.findAll(q);
  }

  @Permissions('clients.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientService.findOne(+id);
  }

  @Permissions('clients.restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() dto: BulkSoftDeleteClientDto) {
    return this.clientService.bulkRestore(dto.ids);
  }

  @Permissions('clients.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientService.update(+id, updateClientDto);
  }

  @Permissions('clients.delete')
  @Delete('bulk-delete')
  bulkSoftDelete(@Body() dto: BulkSoftDeleteClientDto) {
    return this.clientService.bulkSoftDelete(dto.ids);
  }

  @Permissions('clients.delete')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.clientService.softDelete(+id);
  }

  @Permissions('clients.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.clientService.restore(+id);
  }
}
