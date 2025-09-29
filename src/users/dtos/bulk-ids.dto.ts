// src/users/dtos/bulk-ids.dto.ts
import { IsArray, ArrayNotEmpty, ArrayUnique, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkIdsDto {
    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @Type(() => Number)      // "6" -> 6
    @IsInt({ each: true })
    ids!: number[];
}
