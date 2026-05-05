import {
  Transform,
} from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EquipmentType, RequestOrigin, ServiceOrderPriority, ServiceType } from '../enums';

export class CreateServiceOrderDto {
  @IsEnum(RequestOrigin)
  @IsOptional()
  requestOrigin?: RequestOrigin;

  @ValidateIf((dto: CreateServiceOrderDto) => (dto.requestOrigin ?? RequestOrigin.CLIENT) === RequestOrigin.CLIENT)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  clientId?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  clientContactId?: number;

  @IsEnum(ServiceOrderPriority)
  @IsOptional()
  priority?: ServiceOrderPriority;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  assignedToTechnicianId?: number;

  @IsEnum(EquipmentType)
  equipmentType: EquipmentType;

  @ValidateIf((dto: CreateServiceOrderDto) => dto.equipmentType === EquipmentType.OTHER)
  @IsString()
  @MaxLength(120)
  equipmentTypeOther?: string;

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

  @IsDateString()
  @IsOptional()
  estimatedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

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
}
