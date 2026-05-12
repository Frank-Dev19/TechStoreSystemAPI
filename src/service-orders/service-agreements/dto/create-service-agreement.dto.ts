import { IsArray, IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceOrderAgreementProductItemDto } from './service-agreement-product-item.dto';
import { ServiceOrderAgreementStatus } from '../service-agreement-status.enum';
import { ServiceOrderAgreementSource } from '../service-agreement-source.enum';

export class CreateServiceOrderAgreementDto {
  @IsNumber()
  @IsPositive()
  serviceOrderId: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  diagnosisId?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sequenceNumber?: number;

  @IsOptional()
  @IsEnum(ServiceOrderAgreementStatus)
  status?: ServiceOrderAgreementStatus;

  @IsOptional()
  @IsEnum(ServiceOrderAgreementSource)
  source?: ServiceOrderAgreementSource;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderAgreementProductItemDto)
  products?: ServiceOrderAgreementProductItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderAgreementProductItemDto)
  newProducts?: ServiceOrderAgreementProductItemDto[];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  baseAgreementId?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  technicalServiceAmount?: number;
}

