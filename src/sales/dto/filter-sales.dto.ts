// src/sales/dto/filter-sales.dto.ts
import { IsOptional, IsString, IsNumber, IsInt } from 'class-validator';

export class FilterSalesDto {
    @IsNumber()
    companyId: number;

    @IsOptional()
    @IsInt()
    customerId?: number;

    @IsOptional()
    @IsString()
    status?: string; // 'DRAFT' | 'EMITTED' | 'CANCELLED'

    @IsOptional()
    @IsString()
    dateFrom?: string; // 'YYYY-MM-DD'

    @IsOptional()
    @IsString()
    dateTo?: string; // 'YYYY-MM-DD'

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsInt()
    page?: number;

    @IsOptional()
    @IsInt()
    limit?: number;
}
