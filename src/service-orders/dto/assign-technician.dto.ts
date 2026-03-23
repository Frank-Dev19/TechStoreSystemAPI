import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class AssignTechnicianDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  technicianId: number;
}
