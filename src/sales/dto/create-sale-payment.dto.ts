// src/sales/dto/create-sale-payment.dto.ts
import {
    IsNumber,
    IsOptional,
    IsString,
    IsEnum,
    MaxLength,
    IsDateString,
    Min,
} from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum';

export class CreateSalePaymentDto {
    @IsEnum(PaymentMethod)
    method: PaymentMethod;

    @IsNumber()
    @Min(0)
    amount: number;

    @IsOptional()
    @IsDateString()
    paymentDate?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    reference?: string;

    @IsOptional()
    @IsString()
    observations?: string;
}
