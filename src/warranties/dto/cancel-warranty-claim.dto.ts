import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelWarrantyClaimDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
