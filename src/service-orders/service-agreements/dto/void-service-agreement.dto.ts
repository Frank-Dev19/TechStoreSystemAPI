import { IsOptional, IsString } from 'class-validator';

export class RejectClientServiceOrderAgreementDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

