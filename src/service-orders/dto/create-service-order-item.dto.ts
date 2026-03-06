import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { EquipmentType, ServiceType } from '../enums';

export class CreateServiceOrderItemDto {
  @IsEnum(EquipmentType)
  equipmentType: EquipmentType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  brand?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  model?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  serialNumber?: string;

  @IsString()
  @IsNotEmpty()
  initialIssue: string;

  @IsString()
  @IsOptional()
  accessories?: string;

  @IsEnum(ServiceType)
  @IsOptional()
  serviceType?: ServiceType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @IsPositive()
  estimatedRepairHours?: number;
}
