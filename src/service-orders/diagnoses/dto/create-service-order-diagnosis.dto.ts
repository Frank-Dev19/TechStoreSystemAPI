import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ServiceOrderDiagnosisStatus } from '../service-order-diagnosis-status.enum';
import { ServiceOrderDiagnosisOutcome } from '../service-order-diagnosis-outcome.enum';

export class CreateServiceOrderDiagnosisDto {
  @ValidateIf((dto: CreateServiceOrderDiagnosisDto) => dto.serviceOrderId == null)
  @IsNumber()
  @IsPositive()
  serviceOrderItemId?: number;

  /** @deprecated Compatibilidad temporal para órdenes antiguas de un solo equipo. */
  @ValidateIf((dto: CreateServiceOrderDiagnosisDto) => dto.serviceOrderItemId == null)
  @IsNumber()
  @IsPositive()
  serviceOrderId?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  sequenceNumber?: number;

  @IsEnum(ServiceOrderDiagnosisStatus)
  @IsOptional()
  status?: ServiceOrderDiagnosisStatus;

  @IsEnum(ServiceOrderDiagnosisOutcome)
  @IsOptional()
  outcome?: ServiceOrderDiagnosisOutcome;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  summary: string;

  @IsString()
  @IsOptional()
  details?: string;

  @IsString()
  @IsOptional()
  outcomeReason?: string;

  @IsString()
  @IsOptional()
  recommendedAction?: string;
}
