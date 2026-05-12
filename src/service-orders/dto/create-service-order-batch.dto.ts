import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
  Matches,
} from 'class-validator';
import { EquipmentType, RequestOrigin, ServiceOrderPriority, ServiceType } from '../enums';
import { E164_PHONE_REGEX, normalizePhoneInputForValidation } from 'src/common/utils/phone.util';

export class CreateServiceOrderBatchSharedContextDto {
  @IsEnum(RequestOrigin)
  @IsOptional()
  requestOrigin?: RequestOrigin;

  @ValidateIf(
    (dto: CreateServiceOrderBatchSharedContextDto) =>
      (dto.requestOrigin ?? RequestOrigin.CLIENT) === RequestOrigin.CLIENT,
  )
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

  @IsString()
  @MaxLength(150)
  @IsOptional()
  contactName?: string;

  @IsEmail()
  @MaxLength(150)
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @MaxLength(16)
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const normalized = normalizePhoneInputForValidation(value);
    return (normalized ?? String(value).trim()) || undefined;
  })
  @Matches(E164_PHONE_REGEX, { message: 'contactPhone must be a valid E.164 phone number' })
  contactPhone?: string;
}

export class CreateServiceOrderBatchEntryDto {
  @IsEnum(EquipmentType)
  equipmentType: EquipmentType;

  @ValidateIf((dto: CreateServiceOrderBatchEntryDto) => dto.equipmentType === EquipmentType.OTHER)
  @IsString()
  @MaxLength(120)
  @IsOptional()
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
}

export class CreateServiceOrderBatchDto {
  @ValidateNested()
  @Type(() => CreateServiceOrderBatchSharedContextDto)
  sharedContext: CreateServiceOrderBatchSharedContextDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderBatchEntryDto)
  orders: CreateServiceOrderBatchEntryDto[];
}
