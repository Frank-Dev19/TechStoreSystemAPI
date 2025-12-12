import { IsOptional, IsString } from 'class-validator';

export class SendToClientQuoteDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
