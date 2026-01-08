// src/pricing/dto/create-price-list.dto.ts
import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { PriceListType } from '../enums/price-list-type.enum';

export class CreatePriceListDto {
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

    @IsEnum(PriceListType)
    type: PriceListType;

    @IsOptional()
    @IsBoolean()
    is_default?: boolean;

    // @IsOptional()
    // @IsDateString()
    // active_from?: string;

    // @IsOptional()
    // @IsDateString()
    // active_to?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
