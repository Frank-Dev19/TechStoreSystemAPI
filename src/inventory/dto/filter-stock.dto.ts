import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterStockDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    category_id?: number;

    @IsOptional()
    @IsString()
    updated_from?: string;

    @IsOptional()
    @IsString()
    updated_to?: string;

    @IsOptional()
    @IsString()
    expiration_status?: string; // 'ALL', 'EXPIRED', 'NEXT_7', 'NEXT_15', 'NEXT_30'

    @IsOptional()
    @IsString()
    low_stock?: string; // 'true' or 'false'

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number;
}
