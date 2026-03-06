import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequestOrigin, ServiceOrderPriority } from '../enums';
import { CreateServiceOrderItemDto } from './create-service-order-item.dto';

export class CreateServiceOrderDto {
  @IsEnum(RequestOrigin)
  @IsOptional()
  requestOrigin?: RequestOrigin;

  @ValidateIf((dto: CreateServiceOrderDto) => (dto.requestOrigin ?? RequestOrigin.CLIENT) === RequestOrigin.CLIENT)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  clientId?: number;

  @IsEnum(ServiceOrderPriority)
  @IsOptional()
  priority?: ServiceOrderPriority;

  @IsDateString()
  @IsOptional()
  estimatedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderItemDto)
  items: CreateServiceOrderItemDto[];
}
