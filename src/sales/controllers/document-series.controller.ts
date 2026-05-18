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

@Controller('document-series')
@UseGuards(JwtAccessGuard)
export class DocumentSeriesController {
    constructor(private readonly documentSeriesService: DocumentSeriesService) { }

    @Post()
    create(@Body() createDto: CreateDocumentSeriesDto, @Request() req: any) {
        // Agregar información del usuario si no viene en el DTO
        if (!createDto.createdBy) {
            createDto.createdBy = req.user?.name || 'system';
        }
        return this.documentSeriesService.create(createDto);
    }

    @Get()
    findAll(@Query('companyId') companyId: number) {
        if (!companyId) {
            throw new Error('companyId es requerido');
        }
        return this.documentSeriesService.getAll(companyId);
    }

    @Get('active')
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
    async getNextNumber(
        @Query('companyId') companyId: number,
        @Query('documentType') documentType: DocumentType,
    ) {
        if (!companyId || !documentType) {
            throw new Error('companyId y documentType son requeridos');
        }
        return this.documentSeriesService.getNextNumber(Number(companyId), documentType);
    }

    @Get('next-number-formatted')
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
    findOne(@Param('id') id: string) {
        return this.documentSeriesService.findOne(+id);
    }

    @Patch(':id')
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
    remove(@Param('id') id: string) {
        return this.documentSeriesService.delete(+id);
    }
}
