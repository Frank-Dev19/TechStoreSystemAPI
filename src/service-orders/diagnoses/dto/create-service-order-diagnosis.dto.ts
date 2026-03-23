import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { ServiceOrderDiagnosisStatus } from '../service-order-diagnosis-status.enum';
import { ServiceOrderDiagnosisOutcome } from '../service-order-diagnosis-outcome.enum';

export class CreateServiceOrderDiagnosisDto {
  @IsNumber()
  @IsPositive()
  serviceOrderId: number;

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
