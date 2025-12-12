import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class ApproveSupervisorQuoteDto {
  @IsInt()
  @IsPositive()
  supervisorId: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
