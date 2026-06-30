import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { BulkIdsDto } from 'src/common/dtos/bulk-ids.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentTypesService } from './document-types.service';
import type { FindAllQuery } from './document-types.service';

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
  findAll(@Query() q: FindAllQuery) {
    return this.documentTypesService.findAll(q);
  }

  @Permissions('document-type.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentTypesService.findOne(+id);
  }

  @Permissions('document-type.restore')
  @Patch('bulk-restore')
  bulkRestore(@Body() bulkOperationsDto: BulkIdsDto) {
    return this.documentTypesService.bulkRestore(bulkOperationsDto.ids);
  }

  @Permissions('document-type.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDocumentTypeDto: UpdateDocumentTypeDto,
  ) {
    return this.documentTypesService.update(+id, updateDocumentTypeDto);
  }

  @Permissions('document-type.delete')
  @Delete('bulk-delete')
  bulkSoftDelete(@Body() bulkOperationsDto: BulkIdsDto) {
    return this.documentTypesService.bulkSoftDelete(bulkOperationsDto.ids);
  }

  @Permissions('document-type.delete')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.documentTypesService.softDelete(+id);
  }

  @Permissions('document-type.restore')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.documentTypesService.restore(+id);
  }
}
