// src/sales/dto/open-cash-register.dto.ts
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer'; // ✅ Importar

export class OpenCashRegisterDto {
    @Type(() => Number) // ✅ Agregar transformación
    @IsNumber()
    @IsPositive()
    openingBalance: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    observations?: string;
}