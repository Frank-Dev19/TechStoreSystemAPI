import {
    IsBoolean,
    IsEmail,
    IsEnum,
    IsNumberString,
    IsOptional,
    IsString,
    Length,
    MaxLength,
  } from 'class-validator';

import { DocumentType } from '../entities/supplier.entity';

export class CreateSupplierDto {
  @IsString()
  @MaxLength(150)
  businessName: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @IsEnum(DocumentType)
  documentType: DocumentType;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
