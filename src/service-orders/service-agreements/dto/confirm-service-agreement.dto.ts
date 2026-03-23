import { IsOptional, IsString } from 'class-validator';

export class ApproveClientServiceOrderAgreementDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

