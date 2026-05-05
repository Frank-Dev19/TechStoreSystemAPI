import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClientContactInputDto } from './dto/client-contact-input.dto';
import { ClientKind } from './entities/client-kind.enum';

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

  @IsEnum(ClientKind)
  @IsOptional()
  kind?: ClientKind;

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
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientContactInputDto)
  @IsOptional()
  contacts?: ClientContactInputDto[];
}
