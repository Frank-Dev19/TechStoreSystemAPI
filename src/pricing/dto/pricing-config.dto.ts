import { IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePricingConfigDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    product_id?: number | null;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    category_id?: number | null;

    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    profit_margin_pct: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    max_discount_pct: number;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}

export class UpdatePricingConfigDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    profit_margin_pct?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    max_discount_pct?: number;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
