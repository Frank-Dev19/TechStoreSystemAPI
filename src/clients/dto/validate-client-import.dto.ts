import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsPositive, ValidateNested } from 'class-validator';
import { ImportClientRowDto } from './import-client-row.dto';

export class ValidateClientImportDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportClientRowDto)
  rows: ImportClientRowDto[];
}
