import { IsArray, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceOrderQuoteProductItemDto } from './service-quote-product-item.dto';
import { ServiceOrderQuoteServiceItemDto } from './service-quote-service-item.dto';
import { ServiceOrderQuoteStatus } from '../service-quote-status.enum';

export class CreateServiceOrderQuoteDto {
  @IsNumber()
  @IsPositive()
  serviceOrderItemId: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  diagnosisId?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sequenceNumber?: number;

  @IsOptional()
  @IsEnum(ServiceOrderQuoteStatus)
  status?: ServiceOrderQuoteStatus;

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
  @Type(() => ServiceOrderQuoteProductItemDto)
  products?: ServiceOrderQuoteProductItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderQuoteServiceItemDto)
  services?: ServiceOrderQuoteServiceItemDto[];
}
