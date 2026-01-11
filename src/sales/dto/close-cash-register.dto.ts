// src/sales/dto/close-cash-register.dto.ts
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer'; // ✅ Importar

export class CloseCashRegisterDto {
    @Type(() => Number) // ✅ Agregar
    @IsNumber()
    @IsPositive()
    actualCash: number;

    @IsOptional()
    @Type(() => Number) // ✅ Agregar
    @IsNumber()
    actualCard?: number;

    @IsOptional()
    @Type(() => Number) // ✅ Agregar
    @IsNumber()
    actualTransfer?: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    observations?: string;
}