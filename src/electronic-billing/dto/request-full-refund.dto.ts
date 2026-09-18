import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../../sales/enums/payment-method.enum';

export class RequestFullRefundDto {
  @IsOptional()
  @IsIn(['01', '06'])
  reasonCode?: '01' | '06';

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  reason: string;

  @IsEnum(PaymentMethod)
  refundMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}
