import { IsOptional, IsString } from 'class-validator';

export class ApproveClientServiceOrderQuoteDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
