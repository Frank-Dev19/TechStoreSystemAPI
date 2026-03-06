import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { ServiceOrderDiagnosisStatus } from '../service-order-diagnosis-status.enum';

export class CreateServiceOrderDiagnosisDto {
  @IsNumber()
  @IsPositive()
  serviceOrderItemId: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  sequenceNumber?: number;

  @IsEnum(ServiceOrderDiagnosisStatus)
  @IsOptional()
  status?: ServiceOrderDiagnosisStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  summary: string;

  @IsString()
  @IsOptional()
  details?: string;
}
