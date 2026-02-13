// src/sales/dto/update-document-series.dto.ts
import {
    IsBoolean,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class UpdateDocumentSeriesDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    updatedBy?: string;
}