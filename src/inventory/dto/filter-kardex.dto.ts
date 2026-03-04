import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterKardexDto {
    @IsOptional()
    @IsString()
    date_from?: string;

    @IsOptional()
    @IsString()
    date_to?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    product_id?: number;

    @IsOptional()
    @IsString()
    reason_code?: string;

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
