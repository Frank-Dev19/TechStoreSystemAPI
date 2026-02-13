// src/sales/dto/create-document-series.dto.ts
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    Min,
    Validate,
} from 'class-validator';
import { DocumentType } from '../enums/document-type.enum';
import { IsUniqueDocumentSeries } from '../validators/is-unique-document-series.validator';

export class CreateDocumentSeriesDto {
    @IsInt()
    @IsPositive()
    companyId: number;

    @IsEnum(DocumentType)
    documentType: DocumentType;

    @IsString()
    @IsNotEmpty()
    @MaxLength(10)
    @Validate(IsUniqueDocumentSeries)
    code: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean = true;

    @IsOptional()
    @IsInt()
    @Min(1)
    startingNumber?: number = 1;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    createdBy?: string;
}