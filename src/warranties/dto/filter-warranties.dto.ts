import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { WarrantyCoverageStatus } from '../enums/warranty-coverage-status.enum';
import { WarrantyClaimStatus } from '../enums/warranty-claim-status.enum';
import { WarrantySourceType } from '../enums/warranty-source-type.enum';
import { ServiceOrderDiagnosisOutcome } from '../../service-orders/diagnoses/service-order-diagnosis-outcome.enum';

export class FilterWarrantiesDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  limit?: number = 20;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  customerId?: number;

  @IsEnum(WarrantySourceType)
  @IsOptional()
  sourceType?: WarrantySourceType;

  @IsEnum(WarrantyCoverageStatus)
  @IsOptional()
  status?: WarrantyCoverageStatus;

  @IsString()
  @IsOptional()
  search?: string;
}

export class WarrantyTechnicianReportDto {
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class FilterWarrantyClaimsDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  limit?: number = 20;

  @IsEnum(WarrantySourceType)
  @IsOptional()
  sourceType?: WarrantySourceType;

  @IsEnum(WarrantyClaimStatus)
  @IsOptional()
  status?: WarrantyClaimStatus;

  @IsEnum(ServiceOrderDiagnosisOutcome)
  @IsOptional()
  outcome?: ServiceOrderDiagnosisOutcome;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
