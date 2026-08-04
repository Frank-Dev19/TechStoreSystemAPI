import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ServiceOrderClientDecisionChannel } from '../service-order-client-decision-channel.enum';
import { ServiceOrderClientDecisionType } from '../service-order-client-decision-type.enum';

export class RecordServiceOrderClientDecisionDto {
  @IsNumber()
  @IsPositive()
  commercialVersionId: number;

  @IsEnum(ServiceOrderClientDecisionType)
  decision: ServiceOrderClientDecisionType;

  @IsEnum(ServiceOrderClientDecisionChannel)
  channel: ServiceOrderClientDecisionChannel;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  observation?: string;
}
