import { IsIn, IsOptional, IsString } from 'class-validator';

export class OverrideServiceOrderTransitionDto {
  @IsIn(['operativo', 'tecnico', 'comercial', 'economico'])
  axis: 'operativo' | 'tecnico' | 'comercial' | 'economico';

  @IsString()
  to: string;

  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  supervisorNote?: string;
}
