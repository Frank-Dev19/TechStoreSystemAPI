// src/sales/dto/create-sale-item.dto.ts
import {
    IsInt,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    Min,
    IsArray,
    IsInt as IsIntEach,
} from 'class-validator';

export class CreateSaleItemDto {
    @IsInt()
    productId: number;

    @IsOptional()
    @IsInt()
    lotId?: number | null;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;

    @IsNumber()
    @IsPositive()
    quantity: number;

    @IsNumber()
    @Min(0)
    unitPrice: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    discount?: number;

    // El impuesto de la línea lo calculamos en el backend a partir de taxRate de la venta.
    @IsOptional()
    @IsNumber()
    @Min(0)
    taxAmount?: number;

    // Para productos serializados: IDs de seriales (salida)
    @IsOptional()
    @IsArray()
    @IsIntEach({ each: true })
    serialIds?: number[];
}
