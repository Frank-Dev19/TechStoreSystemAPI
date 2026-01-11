// src/sales/dto/cash-flow-transaction.dto.ts
import {
    IsEnum,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer'; // ✅ Importar
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionSubtype } from '../enums/transaction-subtype.enum';

export class CashFlowTransactionDto {
    @IsEnum(TransactionType)
    type: TransactionType;

    @IsOptional()
    @IsEnum(TransactionSubtype)
    subtype?: TransactionSubtype;

    @IsString()
    @MaxLength(255)
    description: string;

    @Type(() => Number) // ✅ Agregar
    @IsNumber()
    @IsPositive()
    amount: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    reference?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    observations?: string;
}