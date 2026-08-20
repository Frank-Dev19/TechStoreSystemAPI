import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MailEncryption } from '../enums/mail-encryption.enum';

export class UpdateMailSettingDto {
  @IsString()
  @MaxLength(180)
  host: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsEnum(MailEncryption)
  encryption: MailEncryption;

  @IsString()
  @MaxLength(180)
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  password?: string;

  @IsString()
  @MaxLength(120)
  fromName: string;

  @IsEmail()
  @MaxLength(180)
  fromEmail: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  replyTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subjectTemplate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  introText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  footerText?: string | null;

  @IsBoolean()
  isActive: boolean;
}

