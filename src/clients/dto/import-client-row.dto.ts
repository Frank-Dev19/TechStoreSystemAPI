import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class ImportClientRowDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  rowNumber: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  documentTypeId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  country?: string;
}
