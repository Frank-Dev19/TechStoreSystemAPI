import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { DiagnosisStatus } from '../diagnosis-status.enum';

export class CreateDiagnosisDto {
  @IsNumber()
  @IsPositive()
  ticketItemId: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  sequenceNumber?: number;

  @IsEnum(DiagnosisStatus)
  @IsOptional()
  status?: DiagnosisStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  summary: string;

  @IsString()
  @IsOptional()
  details?: string;
}
