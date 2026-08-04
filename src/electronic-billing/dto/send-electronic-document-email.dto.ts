import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendElectronicDocumentEmailDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
