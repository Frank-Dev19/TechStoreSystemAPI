import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QuoteProductItemDto } from './quote-product-item.dto';
import { QuoteServiceItemDto } from './quote-service-item.dto';

export class ResubmitQuoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteProductItemDto)
  @IsOptional()
  products?: QuoteProductItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceItemDto)
  @IsOptional()
  services?: QuoteServiceItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
