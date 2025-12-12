// src/pricing/dto/create-discount-rule.dto.ts
import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';
import { DiscountType } from '../enums/discount-type.enum';

export class CreateDiscountRuleDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsInt()
    product_id?: number;

    @IsOptional()
    @IsInt()
    category_id?: number;

    @IsOptional()
    @IsInt()
    price_list_id?: number;

    @IsEnum(DiscountType)
    discount_type: DiscountType;

    @IsNumber()
    @Min(0)
    amount: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    min_qty?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    max_qty?: number;

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
    @IsInt()
    priority?: number;

    @IsOptional()
    @IsBoolean()
    is_exclusive?: boolean;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
