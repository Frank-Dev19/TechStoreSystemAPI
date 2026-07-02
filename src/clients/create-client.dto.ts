import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ClientContactDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateClientDto {
  @IsNumber()
  @IsOptional()
  companyId?: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsIn(['PERSON', 'COMPANY'])
  @IsOptional()
  kind?: 'PERSON' | 'COMPANY';

  @IsNumber()
  @IsNotEmpty()
  documentTypeId: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'documentNumber can only contain letters, numbers, and hyphen',
  })
  documentNumber: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, {
    message: 'ubigeo must contain exactly 6 digits',
  })
  ubigeo?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  province?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  urbanization?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode must contain two uppercase letters',
  })
  countryCode?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isClient?: boolean;

  @IsBoolean()
  @IsOptional()
  isSupplier?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientContactDto)
  @IsOptional()
  contacts?: ClientContactDto[];
}
