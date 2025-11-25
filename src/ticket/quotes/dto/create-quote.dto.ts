import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuoteProductItemDto } from './quote-product-item.dto';
import { QuoteServiceItemDto } from './quote-service-item.dto';
import { QuoteStatus } from '../quote-status.enum';

export class CreateQuoteDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  ticketItemId?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  diagnosisId?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sequenceNumber?: number;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalAmount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteProductItemDto)
  products?: QuoteProductItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceItemDto)
  services?: QuoteServiceItemDto[];
}
