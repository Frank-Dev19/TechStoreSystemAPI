import { IsInt, IsPositive, IsString } from 'class-validator';

export class RejectSupervisorQuoteDto {
  @IsInt()
  @IsPositive()
  supervisorId: number;

  @IsString()
  notes: string;
}
