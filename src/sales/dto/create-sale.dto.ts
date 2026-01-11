// src/sales/dto/create-sale.dto.ts
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleType } from '../enums/sale-type.enum';
import { DocumentType } from '../enums/document-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export class SaleItemDto {
    @IsInt()
    productId: number;

    @IsOptional()
    @IsInt()
    lotId?: number | null;

    @IsNumber()
    @IsPositive()
    quantity: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    baseUnitPrice?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    finalUnitPrice?: number;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    serialIds?: number[];

    @IsOptional()
    @IsInt()
    comboId?: number | null;
}

export class SalePaymentDto {
    @IsEnum(PaymentMethod)
    method: PaymentMethod;

    @IsNumber()
    @IsPositive()
    amount: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    reference?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    bankName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    cardType?: string;

    @IsOptional()
    @IsDateString()
    paymentDate?: string;
}

export class CreateSaleDto {
    @IsInt()
    companyId: number;

    @IsInt()
    customerId: number;

    @IsEnum(SaleType)
    saleType: SaleType;

    @IsEnum(DocumentType)
    documentType: DocumentType;

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

    @IsOptional()
    @IsString()
    @MaxLength(32)
    priceListCode?: string;

    @IsOptional()
    @IsBoolean()
    applyAutoDiscounts?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    taxRate?: number;

    @IsOptional()
    @IsString()
    observations?: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => SaleItemDto)
    items: SaleItemDto[];

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => SalePaymentDto)
    payments: SalePaymentDto[];
}