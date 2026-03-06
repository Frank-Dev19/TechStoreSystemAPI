import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceOrderQuoteProductItemDto } from './service-quote-product-item.dto';
import { ServiceOrderQuoteServiceItemDto } from './service-quote-service-item.dto';

export class ResubmitServiceOrderQuoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderQuoteProductItemDto)
  @IsOptional()
  products?: ServiceOrderQuoteProductItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderQuoteServiceItemDto)
  @IsOptional()
  services?: ServiceOrderQuoteServiceItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
