import {
  IsEnum,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ServiceOrderCancellationResolution } from '../enums';

export class ResolveServiceOrderItemCancellationDto {
  @IsEnum(ServiceOrderCancellationResolution)
  resolution: ServiceOrderCancellationResolution;

  @ValidateIf(
    (dto: ResolveServiceOrderItemCancellationDto) =>
      dto.resolution ===
      ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE,
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  chargeAmount?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
