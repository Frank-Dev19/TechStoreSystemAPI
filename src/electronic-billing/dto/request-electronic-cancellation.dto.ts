import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestElectronicCancellationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}
