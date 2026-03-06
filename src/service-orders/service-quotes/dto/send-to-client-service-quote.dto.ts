import { IsOptional, IsString } from 'class-validator';

export class SendToClientServiceOrderQuoteDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
