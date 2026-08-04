import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { E164_PHONE_REGEX, normalizePhoneInputForValidation } from '../../common/utils/phone.util';
import { EquipmentType, RequestOrigin, ServiceOrderPriority, ServiceType } from '../enums';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';

const trimOptionalText = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim() || undefined;
};

export class CreateServiceOrderInitialCommercialLineDto {
  @IsEnum(ServiceOrderCommercialLineType)
  type: ServiceOrderCommercialLineType;

  @ValidateIf((dto: CreateServiceOrderInitialCommercialLineDto) => dto.type === ServiceOrderCommercialLineType.PRODUCT)
  @IsNumber()
  @IsPositive()
  productId?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  serviceId?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsBoolean()
  @IsOptional()
  requiresPurchase?: boolean;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateServiceOrderInitialCommercialDto {
  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderInitialCommercialLineDto)
  lines: CreateServiceOrderInitialCommercialLineDto[];
}

export class CreateServiceOrderItemDto {
  @IsEnum(EquipmentType)
  equipmentType: EquipmentType;

  @ValidateIf((dto: CreateServiceOrderItemDto) => dto.equipmentType === EquipmentType.OTHER)
  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(120)
  equipmentTypeOther?: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  brand?: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  @MaxLength(150)
  model?: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  serialNumber?: string;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(2000)
  initialIssue: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  accessories?: string;

  @IsEnum(ServiceOrderPriority)
  @IsOptional()
  priority?: ServiceOrderPriority = ServiceOrderPriority.LOW;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @IsPositive()
  estimatedRepairHours?: number;

  @IsDateString()
  @IsOptional()
  estimatedDeliveryDate?: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  warrantySourceItemId?: number;

  @ValidateNested()
  @Type(() => CreateServiceOrderInitialCommercialDto)
  @IsOptional()
  initialCommercial?: CreateServiceOrderInitialCommercialDto;
}

export class CreateServiceOrderAggregateDto {
  @IsEnum(RequestOrigin)
  @IsOptional()
  requestOrigin?: RequestOrigin;

  @ValidateIf(
    (dto: CreateServiceOrderAggregateDto) =>
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

  @IsNumber()
  @IsPositive()
  assignedToTechnicianId: number;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  contactName?: string;

  @Transform(trimOptionalText)
  @IsEmail()
  @MaxLength(150)
  @IsOptional()
  contactEmail?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const normalized = normalizePhoneInputForValidation(value);
    return (normalized ?? String(value).trim()) || undefined;
  })
  @IsString()
  @MaxLength(16)
  @Matches(E164_PHONE_REGEX, { message: 'contactPhone must be a valid E.164 phone number' })
  @IsOptional()
  contactPhone?: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(99)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderItemDto)
  items: CreateServiceOrderItemDto[];
}
