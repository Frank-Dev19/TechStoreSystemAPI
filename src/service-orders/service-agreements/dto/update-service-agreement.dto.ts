import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ServiceOrderAgreementProductItemDto } from './service-agreement-product-item.dto';

export class UpdateServiceOrderAgreementDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(20)
  technicalServiceAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderAgreementProductItemDto)
  newProducts?: ServiceOrderAgreementProductItemDto[];
}

