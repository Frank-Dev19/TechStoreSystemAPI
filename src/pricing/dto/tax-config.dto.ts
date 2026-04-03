import { IsOptional, IsNumber, IsBoolean, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTaxConfigDto {
    @IsString()
    code: string;

    @IsString()
    name: string;

    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    rate_pct: number;

    @IsOptional()
    @IsBoolean()
    is_fixed?: boolean;

    @IsOptional()
    @IsString()
    applies_to?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}

export class UpdateTaxConfigDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    rate_pct?: number;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
