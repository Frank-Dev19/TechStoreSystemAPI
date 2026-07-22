import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { E164_PHONE_REGEX, normalizePhoneInputForValidation } from 'src/common/utils/phone.util';
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

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const normalized = normalizePhoneInputForValidation(value);
    return (normalized ?? value.trim()) || undefined;
  })
  @IsString()
  @Matches(E164_PHONE_REGEX, { message: 'phone must be a valid E.164 phone number' })
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

  @IsString()
  @Matches(/^\d{6}$/)
  @IsOptional()
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
  @Matches(/^[A-Z]{2}$/)
  @IsOptional()
  countryCode?: string;

  @IsBoolean()
  @IsOptional()
  isClient?: boolean;

  @IsBoolean()
  @IsOptional()
  isSupplier?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientContactInputDto)
  @IsOptional()
  contacts?: ClientContactInputDto[];
}
