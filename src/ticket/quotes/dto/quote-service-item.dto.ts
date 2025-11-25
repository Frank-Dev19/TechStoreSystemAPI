import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class QuoteServiceItemDto {
  @IsNumber()
  @IsPositive()
  serviceId: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}
