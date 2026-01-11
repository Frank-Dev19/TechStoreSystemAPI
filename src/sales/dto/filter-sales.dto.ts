// src/sales/dto/filter-sales.dto.ts
import {
    IsDateString,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Min,
    Max
} from 'class-validator';
import { Type } from 'class-transformer'; // ✅ Importar Type
import { SaleStatus } from '../enums/sale-status.enum';
import { DocumentType } from '../enums/document-type.enum';
import { SaleType } from '../enums/sale-type.enum';

export class FilterSalesDto {
    @Type(() => Number) // ✅ Agregar transformación
    @IsInt()
    companyId: number;

    @IsOptional()
    @Type(() => Number) // ✅ Agregar transformación
    @IsInt()
    customerId?: number;

    @IsOptional()
    @IsEnum(SaleStatus)
    status?: SaleStatus;

    @IsOptional()
    @IsEnum(DocumentType)
    documentType?: DocumentType;

    @IsOptional()
    @IsEnum(SaleType)
    saleType?: SaleType;

    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Type(() => Number) // ✅ Agregar transformación
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number) // ✅ Agregar transformación
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 10;
}