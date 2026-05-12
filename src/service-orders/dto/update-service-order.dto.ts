import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  Matches,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { E164_PHONE_REGEX, normalizePhoneInputForValidation } from 'src/common/utils/phone.util';
import { CreateServiceOrderDto } from './create-service-order.dto';

export class UpdateServiceOrderDto extends PartialType(CreateServiceOrderDto) {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(150)
  @IsOptional()
  contactName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsEmail()
  @MaxLength(150)
  @IsOptional()
  contactEmail?: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const normalized = normalizePhoneInputForValidation(value);
    return (normalized ?? value.trim()) || undefined;
  })
  @IsString()
  @MaxLength(16)
  @Matches(E164_PHONE_REGEX, { message: 'contactPhone must be a valid E.164 phone number' })
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
