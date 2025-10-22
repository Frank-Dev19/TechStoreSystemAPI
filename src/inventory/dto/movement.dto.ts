// movement.dto.ts
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ArrayMinSize, IsPositive, Min } from 'class-validator';
export enum MovementTypeEnum { IN = 'IN', OUT = 'OUT', ADJ = 'ADJ' }

export class MovementDto {
    @IsEnum(MovementTypeEnum) type: MovementTypeEnum;
    @IsInt() product_id: number;

    @IsNumber()
    qty: number; // puede ser negativa en ADJ, positiva en IN/OUT

    @IsNumber() @IsOptional() unit_cost?: number;
    @IsInt() @IsOptional() lot_id?: number | null;

    // NUEVO: soporte para múltiples seriales
    @IsArray() @IsInt({ each: true }) @IsOptional()
    serial_ids?: number[]; // OUT o ADJ (qty < 0)

    @IsArray() @IsString({ each: true }) @IsOptional()
    serial_codes?: string[]; // IN o ADJ (qty > 0)

    @IsString() @IsNotEmpty() reason_code: string;
    @IsString() @IsOptional() notes?: string;
    @IsString() @IsOptional() source_doc_type?: string;
    @IsString() @IsOptional() source_doc_id?: string;

    // <-- NUEVO
    @IsString() @IsOptional()
    user_created?: string;

}
