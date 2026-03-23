import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceOrderAgreementProductItemDto } from './service-agreement-product-item.dto';
import { ServiceOrderAgreementServiceItemDto } from './service-agreement-service-item.dto';

export class ResubmitServiceOrderAgreementDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderAgreementProductItemDto)
  @IsOptional()
  products?: ServiceOrderAgreementProductItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderAgreementServiceItemDto)
  @IsOptional()
  services?: ServiceOrderAgreementServiceItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

