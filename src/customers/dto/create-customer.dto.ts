import {
    IsBoolean,
    IsInt,
    IsNumberString,
    IsOptional,
    IsString,
    IsEmail,
    Length,
    MaxLength,
  } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCustomerDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @Type(() => Number)
  @IsInt()
  documentTypeId: number;

  @IsNumberString()
  @Length(8, 11)
  documentNumber: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
