// src/pricing/dto/create-combo.dto.ts
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    IsInt,
} from 'class-validator';
import { ComboType } from '../enums/combo-type.enum';

export class ComboItemInputDto {
    @IsInt()
    product_id: number;

    @IsNumber()
    @Min(0.0001)
    qty: number;
}

export class CreateComboDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    code: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsEnum(ComboType)
    combo_type: ComboType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    combo_price?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount_percent?: number;

    @IsOptional()
    @IsBoolean()
    auto_apply?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    requires_permission?: string;

    @IsOptional()
    @IsDateString()
    starts_at?: string;

    @IsOptional()
    @IsDateString()
    ends_at?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @IsArray()
    @ArrayMinSize(1)
    items: ComboItemInputDto[];
}
