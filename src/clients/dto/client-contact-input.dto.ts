import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { E164_PHONE_REGEX, normalizePhoneInputForValidation } from 'src/common/utils/phone.util';

export class ClientContactInputDto {
  @Type(() => Number)
  @IsOptional()
  id?: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(150)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsEmail()
  @MaxLength(150)
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
  @MaxLength(16)
  @Matches(E164_PHONE_REGEX, { message: 'phone must be a valid E.164 phone number' })
  @IsOptional()
  phone?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
