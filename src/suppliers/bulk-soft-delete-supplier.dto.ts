import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';

export class BulkSoftDeleteSupplierDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}
