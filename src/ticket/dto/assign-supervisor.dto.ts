import { IsInt, IsPositive } from 'class-validator';

export class AssignSupervisorDto {
  @IsInt()
  @IsPositive()
  supervisorId: number;
}
