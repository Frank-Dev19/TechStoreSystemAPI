import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ServiceOrderCancellationChannel } from '../enums';

export class RequestServiceOrderItemsCancellationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  itemIds: number[];

  @IsEnum(ServiceOrderCancellationChannel)
  channel: ServiceOrderCancellationChannel;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsBoolean()
  customerChargeAcknowledged?: boolean;
}
