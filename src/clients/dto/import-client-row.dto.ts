import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { normalizePhoneInputForValidation } from 'src/common/utils/phone.util';

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
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const normalized = normalizePhoneInputForValidation(value);
    return (normalized ?? value.trim()) || undefined;
  })
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  ubigeo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  urbanization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  country?: string;
}
