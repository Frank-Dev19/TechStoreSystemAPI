// src/pricing/dto/simulation-query.dto2.ts
import {
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsBoolean,
    IsEnum,
    IsArray,
    Min,
    IsDateString,
} from 'class-validator';

export enum SimulationMode {
    SIMPLE = 'simple',
    ADVANCED = 'advanced',
    AUDIT = 'audit',
}

export class SimulationQueryDto {
    @IsOptional()
    @IsInt()
    product_id?: number;

    @IsOptional()
    @IsInt()
    combo_id?: number;

    @IsNumber()
    @Min(0.0001)
    qty: number;

    @IsOptional()
    @IsString()
    price_list_code?: string;

    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    user_permissions?: string[];

    @IsOptional()
    @IsBoolean()
    include_combos?: boolean;

    @IsOptional()
    @IsBoolean()
    include_technical_details?: boolean;

    @IsOptional()
    @IsEnum(SimulationMode)
    mode?: SimulationMode;
}

export class BatchSimulationQueryDto {
    @IsArray()
    @IsInt({ each: true })
    product_ids: number[];

    @IsArray()
    @IsNumber({}, { each: true })
    quantities: number[];

    @IsArray()
    @IsString({ each: true })
    price_list_codes: string[];
}