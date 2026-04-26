import { IsOptional, IsString } from 'class-validator';

export class TransitionServiceOrderTechnicalDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
