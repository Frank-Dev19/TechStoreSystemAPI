import { IsString, MaxLength, MinLength } from 'class-validator';

export class SignQzPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1_000_000)
  payload!: string;
}
