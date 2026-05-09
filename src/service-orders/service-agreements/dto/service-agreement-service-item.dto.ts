import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { ServiceOrderAgreementLineProvenance } from '../service-agreement-line-provenance.enum';

export class ServiceOrderAgreementServiceItemDto {
  @IsNumber()
  @IsPositive()
  serviceId: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;

  @IsOptional()
  @IsEnum(ServiceOrderAgreementLineProvenance)
  provenance?: ServiceOrderAgreementLineProvenance;

  @IsOptional()
  @IsNumber()
  derivedFromItemId?: number | null;

  @IsOptional()
  @IsBoolean()
  isInherited?: boolean;

  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;
}

