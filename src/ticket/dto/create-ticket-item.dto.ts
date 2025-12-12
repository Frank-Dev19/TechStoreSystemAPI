import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { EquipmentType, ServiceLocation, ServiceType } from '../enums';

export class CreateTicketItemDto {
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

  @IsEnum(ServiceLocation)
  @IsOptional()
  serviceLocation?: ServiceLocation;

  @IsString()
  @IsOptional()
  serviceAddress?: string;

  @IsString()
  @IsOptional()
  serviceAddressReference?: string;

  @IsDateString()
  @IsOptional()
  scheduledServiceDate?: string;

  @IsInt()
  @IsOptional()
  @IsPositive()
  slaTargetDays?: number;

  @IsBoolean()
  @IsOptional()
  requiresParts?: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @IsPositive()
  estimatedRepairHours?: number;
}
