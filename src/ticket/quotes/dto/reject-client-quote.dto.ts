import { IsOptional, IsString } from 'class-validator';

export class RejectClientQuoteDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
