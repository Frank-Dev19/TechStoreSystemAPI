import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(20)
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
