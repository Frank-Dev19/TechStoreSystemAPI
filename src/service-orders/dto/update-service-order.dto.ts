import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateServiceOrderDto } from './create-service-order.dto';
import { ServiceOrderPaymentStatus, ServiceOrderStatus, ServiceOrderWorkflowStatus } from '../enums';

export class UpdateServiceOrderDto extends PartialType(CreateServiceOrderDto) {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(150)
  @IsOptional()
  contactName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsEmail()
  @MaxLength(150)
  @IsOptional()
  contactEmail?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(20)
  @IsOptional()
  contactPhone?: string;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @IsEnum(ServiceOrderStatus)
  @IsOptional()
  status?: ServiceOrderStatus;

  @IsEnum(ServiceOrderWorkflowStatus)
  @IsOptional()
  workflowStatus?: ServiceOrderWorkflowStatus;

  @IsEnum(ServiceOrderPaymentStatus)
  @IsOptional()
  paymentStatus?: ServiceOrderPaymentStatus;

  @ValidateIf((dto: UpdateServiceOrderDto) => dto.status === ServiceOrderStatus.CANCELLED)
  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
