// src/sales/dto/create-sale.dto.ts
import {
    IsArray,
    ArrayMinSize,
    IsDateString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    IsInt,
} from 'class-validator';
import { CreateSaleItemDto } from './create-sale-item.dto';
import { CreateSalePaymentDto } from './create-sale-payment.dto';

export class CreateSaleDto {
    @IsNumber()
    companyId: number;

    @IsNumber()
    customerId: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    documentType: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(10)
    series: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(15)
    number: string;

    @IsDateString()
    issueDate: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    currency: string; // 'PEN', 'USD', etc.

    @IsOptional()
    @IsNumber()
    @Min(0)
    exchangeRate?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    taxRate?: number; // ej. 0.18

    @IsOptional()
    @IsString()
    observations?: string;

    @IsArray()
    @ArrayMinSize(1)
    items: CreateSaleItemDto[];

    @IsOptional()
    @IsArray()
    payments?: CreateSalePaymentDto[];
}
