// src/sales/controllers/document-series.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { DocumentSeriesService } from '../services/document-series.service';
import { CreateDocumentSeriesDto } from '../dto/create-document-series.dto';
import { UpdateDocumentSeriesDto } from '../dto/update-document-series.dto';
import { DocumentType } from '../enums/document-type.enum';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard'
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';

@Controller('document-series')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DocumentSeriesController {
    constructor(private readonly documentSeriesService: DocumentSeriesService) { }

    @Post()
    @Permissions('document-series.manage')
    create(@Body() createDto: CreateDocumentSeriesDto, @Request() req: any) {
        // Agregar información del usuario si no viene en el DTO
        if (!createDto.createdBy) {
            createDto.createdBy = req.user?.name || 'system';
        }
        return this.documentSeriesService.create(createDto);
    }

    @Get()
    @Permissions('document-series.read')
    findAll(@Query('companyId') companyId: number) {
        if (!companyId) {
            throw new Error('companyId es requerido');
        }
        return this.documentSeriesService.getAll(companyId);
    }

    @Get('active')
    @Permissions('document-series.read')
    findActive(
        @Query('companyId') companyId: number,
        @Query('documentType') documentType?: DocumentType,
    ) {
        if (!companyId) {
            throw new Error('companyId es requerido');
        }
        return this.documentSeriesService.getActive(companyId, documentType);
    }

    @Get('preview-next-number')
    @Permissions('document-series.read')
    async previewNextNumber(
        @Query('companyId') companyId: number,
        @Query('documentType') documentType: DocumentType,
    ) {
        if (!companyId || !documentType) {
            throw new Error('companyId y documentType son requeridos');
        }
        return this.documentSeriesService.previewNextNumber(Number(companyId), documentType);
    }

    @Get('next-number')
    @Permissions('document-series.read')
    async getNextNumber(
        @Query('companyId') companyId: number,
        @Query('documentType') documentType: DocumentType,
    ) {
        if (!companyId || !documentType) {
            throw new Error('companyId y documentType son requeridos');
        }
        return this.documentSeriesService.previewNextNumber(Number(companyId), documentType);
    }

    @Get('next-number-formatted')
    @Permissions('document-series.read')
    async getNextNumberFormatted(
        @Query('companyId') companyId: number,
        @Query('documentType') documentType: DocumentType,
    ) {
        if (!companyId || !documentType) {
            throw new Error('companyId y documentType son requeridos');
        }
        const formatted = await this.documentSeriesService.previewNextNumberForCompany(Number(companyId), documentType);
        return { formatted };
    }

    @Get(':id')
    @Permissions('document-series.read')
    findOne(@Param('id') id: string) {
        return this.documentSeriesService.findOne(+id);
    }

    @Patch(':id')
    @Permissions('document-series.manage')
    update(
        @Param('id') id: string,
        @Body() updateDto: UpdateDocumentSeriesDto,
        @Request() req: any,
    ) {
        // Agregar información del usuario si no viene en el DTO
        if (!updateDto.updatedBy) {
            updateDto.updatedBy = req.user?.name || 'system';
        }
        return this.documentSeriesService.update(+id, updateDto);
    }

    @Delete(':id')
    @Permissions('document-series.manage')
    remove(@Param('id') id: string) {
        return this.documentSeriesService.delete(+id);
    }
}
