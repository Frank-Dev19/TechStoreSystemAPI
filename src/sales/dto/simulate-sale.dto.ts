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
import { SaleItemKindDto } from './create-sale.dto';

export class SimulateItemDto {
    @IsOptional()
    @IsEnum(SaleItemKindDto)
    itemType?: SaleItemKindDto;

    @IsOptional()
    @IsInt()
    productId?: number;

    @IsOptional()
    @IsInt()
    serviceId?: number;

    @IsNumber()
    @IsPositive()
    quantity: number;

    @IsOptional()
    @IsInt()
    comboId?: number | null;

    @IsOptional()
    @IsNumber()
    baseUnitPrice?: number;

    @IsOptional()
    @IsString()
    @MaxLength(256)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    serviceCodeSnapshot?: string;

    @IsOptional()
    @IsString()
    @MaxLength(256)
    serviceNameSnapshot?: string;

    @IsOptional()
    @IsNumber()
    @IsPositive()
    finalUnitPrice?: number;

    @IsOptional()
    @IsNumber()
    discountPct?: number;
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
