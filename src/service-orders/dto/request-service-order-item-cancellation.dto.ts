import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ServiceOrderCancellationChannel } from '../enums';

export class RequestServiceOrderItemCancellationDto {
  @IsEnum(ServiceOrderCancellationChannel)
  channel: ServiceOrderCancellationChannel;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
