import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class TestMailSettingDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  recipient?: string;
}

