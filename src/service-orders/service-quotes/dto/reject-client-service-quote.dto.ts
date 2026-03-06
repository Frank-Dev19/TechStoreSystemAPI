import { IsOptional, IsString } from 'class-validator';

export class RejectClientServiceOrderQuoteDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
