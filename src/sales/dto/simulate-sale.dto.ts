// src/sales/dto/simulate-sale.dto.ts
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleType } from '../enums/sale-type.enum';

export class SimulateItemDto {
    @IsInt()
    productId: number;

    @IsNumber()
    @IsPositive()
    quantity: number;

    @IsOptional()
    @IsInt()
    comboId?: number | null;
}

export class SimulateSaleDto {
    @IsInt()
    customerId: number;

    @IsEnum(SaleType)
    saleType: SaleType;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    priceListCode?: string;

    @IsOptional()
    @IsBoolean()
    applyAutoDiscounts?: boolean;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SimulateItemDto)
    items: SimulateItemDto[];

    @IsOptional()
    @IsString({ each: true })
    userPermissions?: string[];
}