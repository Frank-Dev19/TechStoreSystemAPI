// src/sales/services/document-series.service.ts
import {
    Injectable,
    BadRequestException,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DocumentSeries } from '../entities/document-series.entity';
import { CreateDocumentSeriesDto } from '../dto/create-document-series.dto';
import { UpdateDocumentSeriesDto } from '../dto/update-document-series.dto';
import { DocumentType } from '../enums/document-type.enum';
import { setDocumentSeriesService } from '../validators/is-unique-document-series.validator';
import { assertValidSeriesCode } from '../mappers/sunat-document-type.mapper';

@Injectable()
export class DocumentSeriesService implements OnModuleInit {
    constructor(
        @InjectRepository(DocumentSeries)
        private readonly documentSeriesRepo: Repository<DocumentSeries>,
    ) {}

    onModuleInit() {
        // Inicializar el validador con este servicio
        setDocumentSeriesService(this);
    }

    async getAll(companyId: number): Promise<DocumentSeries[]> {
        return this.documentSeriesRepo.find({
            where: { companyId },
            order: { documentType: 'ASC', code: 'ASC' },
        });
    }

    async getActive(companyId: number, documentType?: DocumentType): Promise<DocumentSeries[]> {
        const where: any = { companyId, isActive: true };
        if (documentType) {
            where.documentType = documentType;
        }
        
        return this.documentSeriesRepo.find({
            where,
            order: { code: 'ASC' },
        });
    }

    async getActiveByType(companyId: number, documentType: DocumentType): Promise<DocumentSeries | null> {
        return this.documentSeriesRepo.findOne({
            where: {
                companyId,
                documentType,
                isActive: true,
            },
        });
    }

    async findOne(id: number): Promise<DocumentSeries> {
        const series = await this.documentSeriesRepo.findOne({ where: { id } });
        if (!series) {
            throw new NotFoundException(`Serie con ID ${id} no encontrada`);
        }
        return series;
    }

    async create(createDto: CreateDocumentSeriesDto): Promise<DocumentSeries> {
        const normalizedCode = assertValidSeriesCode(createDto.documentType, createDto.code);
        const isActive = createDto.isActive ?? true;

        // Verificar que no haya otra serie activa para el mismo tipo de documento
        if (isActive) {
            const existingActive = await this.getActiveByType(createDto.companyId, createDto.documentType);
            if (existingActive) {
                throw new BadRequestException(
                    `Ya existe una serie activa (${existingActive.code}) para el tipo de documento ${createDto.documentType}. Desactívela primero.`
                );
            }
        }

        const series = this.documentSeriesRepo.create({
            ...createDto,
            code: normalizedCode,
            isActive,
            currentNumber: createDto.startingNumber || 1,
        });

        return this.documentSeriesRepo.save(series);
    }

    async update(id: number, updateDto: UpdateDocumentSeriesDto): Promise<DocumentSeries> {
        const series = await this.findOne(id);

        // Si se está activando, verificar que no haya otra serie activa para el mismo tipo
        if (updateDto.isActive && !series.isActive) {
            const existingActive = await this.getActiveByType(series.companyId, series.documentType);
            if (existingActive && existingActive.id !== id) {
                throw new BadRequestException(
                    `Ya existe una serie activa (${existingActive.code}) para el tipo de documento ${series.documentType}. Desactívela primero.`
                );
            }
        }

        Object.assign(series, updateDto);
        return this.documentSeriesRepo.save(series);
    }

async delete(id: number): Promise<void> {
        const series = await this.findOne(id);
        
        // No permitir eliminar series activas
        if (series.isActive) {
            throw new BadRequestException('No se puede eliminar una serie activa. Desactívela primero.');
        }
        
        await this.documentSeriesRepo.softDelete(id);
    }

    // Método para el validador
    async findByCode(companyId: number, documentType: DocumentType, code: string): Promise<DocumentSeries | null> {
        return this.documentSeriesRepo.findOne({
            where: {
                companyId,
                documentType,
                code: String(code ?? '').trim().toUpperCase(),
            },
        });
    }

    private formatNumber(number: number): string {
        return number.toString().padStart(8, '0');
    }

    async previewNextNumber(companyId: number, documentType: DocumentType): Promise<{ series: string; number: string }> {
        const activeSeries = await this.getActiveByType(companyId, documentType);

        if (!activeSeries) {
            throw new BadRequestException(
                `No hay una serie activa para ${documentType}. Configure una serie primero.`
            );
        }

        return {
            series: activeSeries.code,
            number: this.formatNumber(activeSeries.currentNumber),
        };
    }

    async reserveNextNumber(
        manager: EntityManager,
        companyId: number,
        documentType: DocumentType,
    ): Promise<{ documentSeriesId: number; series: string; number: string }> {
        const activeSeries = await manager.findOne(DocumentSeries, {
            where: {
                companyId,
                documentType,
                isActive: true,
            },
            lock: { mode: 'pessimistic_write' },
        });

        if (!activeSeries) {
            throw new BadRequestException(
                `No hay una serie activa para ${documentType}. Configure una serie primero.`
            );
        }

        const nextNumber = activeSeries.currentNumber;
        await manager.increment(DocumentSeries, { id: activeSeries.id }, 'currentNumber', 1);

        return {
            documentSeriesId: activeSeries.id,
            series: activeSeries.code,
            number: this.formatNumber(nextNumber),
        };
    }

    // Compatibilidad con consumidores antiguos: consultar el siguiente número nunca debe consumirlo.
    async getNextNumber(companyId: number, documentType: DocumentType): Promise<{ series: string; number: string }> {
        return this.previewNextNumber(companyId, documentType);
    }

    async getNextNumberForCompany(companyId: number, documentType: DocumentType): Promise<string> {
        const { series, number } = await this.previewNextNumber(companyId, documentType);
        return `${series}-${number}`;
    }

    async previewNextNumberForCompany(companyId: number, documentType: DocumentType): Promise<string> {
        const { series, number } = await this.previewNextNumber(companyId, documentType);
        return `${series}-${number}`;
    }
}
