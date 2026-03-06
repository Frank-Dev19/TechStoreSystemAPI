import { IsInt, IsPositive } from 'class-validator';

export class AssignTechnicianDto {
  @IsInt()
  @IsPositive()
  technicianId: number;
}
