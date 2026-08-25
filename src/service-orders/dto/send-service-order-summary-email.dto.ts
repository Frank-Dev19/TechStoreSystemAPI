import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class SendServiceOrderSummaryEmailDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  to?: string;
}
