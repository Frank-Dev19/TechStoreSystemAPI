import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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
}
