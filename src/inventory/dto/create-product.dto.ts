import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class CreateProductDto {
    @IsString() @MaxLength(64) @IsNotEmpty() sku: string;
    @IsString() @MaxLength(256) @IsNotEmpty() name: string;
    @IsString() @IsOptional() description?: string;

    // Front manda unit_id → lo aceptamos y mapeamos a baseUnitId.
    @IsInt() category_id: number;
    @IsInt() unit_id: number; // mapeo interno a baseUnitId

    @IsBoolean() is_serialized: boolean;
    @IsBoolean() manages_expiration: boolean;

    @IsInt() @Min(0) min_stock: number;
    @IsInt() @Min(0) max_stock: number;
    @IsInt() @Min(0) reorder_point: number;
}
