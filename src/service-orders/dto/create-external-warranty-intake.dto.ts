import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { WarrantyDurationUnit } from '../../common/enums/warranty-duration-unit.enum';
import {
  E164_PHONE_REGEX,
  normalizePhoneInputForValidation,
} from '../../common/utils/phone.util';
import { WarrantyResponsibility } from '../../warranties/enums/warranty-responsibility.enum';
import { EquipmentType, ServiceOrderPriority } from '../enums';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateExternalWarrantyIntakeDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assignedToTechnicianId: number;

  @Transform(trim)
  @IsString()
  @MaxLength(20)
  externalDocumentType: string;

  @Transform(trim)
  @IsString()
  @MaxLength(20)
  externalDocumentSeries: string;

  @Transform(trim)
  @IsString()
  @MaxLength(30)
  externalDocumentNumber: string;

  @IsDateString()
  externalDocumentDate: string;

  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  externalEvidenceReference?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  externalProductCode?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  productDescription: string;

  @IsEnum(WarrantyResponsibility)
  responsibility: WarrantyResponsibility;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  durationValue: number;

  @IsEnum(WarrantyDurationUnit)
  durationUnit: WarrantyDurationUnit;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  coverageAmount: number;

  @IsEnum(EquipmentType)
  equipmentType: EquipmentType;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  equipmentTypeOther?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  brand?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  model?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  serialNumber?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  accessories?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  receivedCondition?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reportedIssue: string;

  @IsEnum(ServiceOrderPriority)
  @IsOptional()
  priority?: ServiceOrderPriority;

  @IsDateString()
  @IsOptional()
  estimatedDeliveryDate?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @Transform(({ value }) => normalizePhoneInputForValidation(value))
  @Matches(E164_PHONE_REGEX)
  @IsOptional()
  contactPhone?: string;

  @Transform(trim)
  @IsEmail()
  @IsOptional()
  contactEmail?: string;
}
