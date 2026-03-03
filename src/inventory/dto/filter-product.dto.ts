// src/inventory/dto/filter-product.dto.ts
import {
    IsInt,
    IsOptional,
    IsString,
    Min,
    Max
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilterProductDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    categoryId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;
}
