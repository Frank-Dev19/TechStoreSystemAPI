import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateServiceOrderPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  method?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
