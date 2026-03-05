import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';

export class BulkSoftDeleteClientDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}
