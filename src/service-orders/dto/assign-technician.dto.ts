import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class AssignTechnicianDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  technicianId: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  warrantyOverrideReason?: string;
}
