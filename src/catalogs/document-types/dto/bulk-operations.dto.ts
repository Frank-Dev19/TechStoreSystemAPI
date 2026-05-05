import { ArrayNotEmpty, IsArray, IsNumber } from 'class-validator';

export class BulkOperationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  ids: number[];
}
