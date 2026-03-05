import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketPriority, PaymentStatus } from '../enums';
import { CreateTicketItemDto } from './create-ticket-item.dto';

export class CreateTicketDto {
  @IsNumber()
  @IsPositive()
  clientId: number;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  contactName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  contactPhone: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  contactEmail?: string;

  @IsDateString()
  @IsOptional()
  estimatedDeliveryDate?: string;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTicketItemDto)
  items: CreateTicketItemDto[];
}
