// src/pricing/dto/product-pricing-query.dto.ts
import {
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class ProductPricingQueryDto {
    @IsInt()
    product_id: number;

    @IsNumber()
    @Min(0.0001)
    qty: number;

    @IsOptional()
    @IsString()
    price_list_code?: string; // RETAIL / WHOLESALE

    @IsOptional()
    @IsDateString()
    date?: string;

    // Opcional: permisos del usuario, para discounts manuales / especiales
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    user_permissions?: string[];
}
