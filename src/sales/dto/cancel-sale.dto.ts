// src/sales/dto/cancel-sale.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CancelSaleDto {
    @IsNotEmpty()
    @IsString()
    reason: string;

    @IsOptional()
    @IsString()
    observations?: string;
}