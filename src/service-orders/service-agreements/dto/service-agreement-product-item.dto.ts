import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class ServiceOrderAgreementProductItemDto {
  @IsNumber()
  @IsPositive()
  productId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  unitPrice?: number;

  @IsBoolean()
  @IsOptional()
  requiresPurchase?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}

