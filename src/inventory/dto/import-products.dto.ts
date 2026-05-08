import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportProductRowDto {
    @IsString() @MaxLength(64) @IsNotEmpty() sku: string;
    @IsString() @MaxLength(256) @IsNotEmpty() name: string;
    @IsString() @IsOptional() description?: string | null;
    @IsString() @IsOptional() @MaxLength(128) brand?: string | null;

    @IsInt() category_id: number;
    @IsInt() unit_id: number;

    @IsBoolean() is_serialized: boolean;
    @IsBoolean() manages_expiration: boolean;

    @IsInt() @Min(0) min_stock: number;
    @IsInt() @Min(0) max_stock: number;
    @IsInt() @Min(0) reorder_point: number;
}

export class ImportProductsDto {
    @IsOptional()
    @IsIn(['skip', 'update'])
    duplicateMode?: 'skip' | 'update';

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ImportProductRowDto)
    rows: ImportProductRowDto[];
}
