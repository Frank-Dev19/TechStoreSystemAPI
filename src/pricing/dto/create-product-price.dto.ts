// src/pricing/dto/create-product-price.dto.ts
import {
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsBoolean,
    Min,
    MaxLength,
    IsDateString,
} from 'class-validator';

export class CreateProductPriceDto {
    @IsInt()
    product_id: number;

    @IsInt()
    price_list_id: number;

    @IsNumber()
    @Min(0)
    unit_price: number;

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency_code?: string;

    @IsNumber()
    @Min(0)
    min_qty: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    max_qty?: number;

    @IsOptional()
    @IsDateString()
    valid_from?: string;

    @IsOptional()
    @IsDateString()
    valid_to?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
