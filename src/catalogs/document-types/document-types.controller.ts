import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { DocumentTypesService } from './document-types.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly documentTypesService: DocumentTypesService) {}

  @Permissions('document-type.create')
  @Post()
  create(@Body() createDocumentTypeDto: CreateDocumentTypeDto) {
    return this.documentTypesService.create(createDocumentTypeDto);
  }

  @Permissions('document-type.read')
  @Get()
  findAll(@Query() q: any) {
    return this.documentTypesService.findAll(q);
  }

  @Permissions('document-type.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentTypesService.findOne(+id);
  }

  @Permissions('document-type.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDocumentTypeDto: UpdateDocumentTypeDto) {
    return this.documentTypesService.update(+id, updateDocumentTypeDto);
  }

  @Permissions('document-type.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentTypesService.remove(+id);
  }

  @Permissions('document-type.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.documentTypesService.restore(+id);
  }

  @Permissions('document-type.hard-remove')
  @Delete(':id/hard-remove')
  hardRemove(@Param('id') id: string) {
    return this.documentTypesService.hardRemove(+id);
  }

}
