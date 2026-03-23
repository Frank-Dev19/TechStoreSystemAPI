import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeServiceOrderWorkflowStatusDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  reason?: string;
}
