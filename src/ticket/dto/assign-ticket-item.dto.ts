import { IsInt, IsPositive } from 'class-validator';

export class AssignTicketItemDto {
  @IsInt()
  @IsPositive()
  technicianId: number;
}
