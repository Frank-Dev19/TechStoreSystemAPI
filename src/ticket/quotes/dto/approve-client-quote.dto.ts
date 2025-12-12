import { IsOptional, IsString } from 'class-validator';

export class ApproveClientQuoteDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
