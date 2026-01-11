import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestRediagnosisDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
