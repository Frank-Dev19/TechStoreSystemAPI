import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { IsEnum } from 'class-validator';
import { WarrantyDurationUnit } from '../../common/enums/warranty-duration-unit.enum';

export class CreateProductDto {
    @IsString() @MaxLength(64) @IsNotEmpty() sku: string;
    @IsString() @MaxLength(256) @IsNotEmpty() name: string;
    @IsString() @IsOptional() description?: string;
    @IsString() @IsOptional() @MaxLength(128) brand?: string | null;

    // Front sends unit_id and we map it internally to baseUnitId.
    @IsInt() category_id: number;
    @IsInt() unit_id: number;

    @IsBoolean() is_serialized: boolean;
    @IsBoolean() manages_expiration: boolean;

    @IsInt() @Min(0) @IsOptional() warranty_duration_value?: number = 0;
    @IsEnum(WarrantyDurationUnit) @IsOptional() warranty_duration_unit?: WarrantyDurationUnit = WarrantyDurationUnit.DAY;

    @IsInt() @Min(0) min_stock: number;
    @IsInt() @Min(0) max_stock: number;
    @IsInt() @Min(0) reorder_point: number;
}
