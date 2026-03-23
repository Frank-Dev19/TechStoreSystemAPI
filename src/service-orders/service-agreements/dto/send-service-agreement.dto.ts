import { IsOptional, IsString } from 'class-validator';

export class SendToClientServiceOrderAgreementDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

