import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { EquipmentType, ServiceOrderPriority } from '../enums';

const trimOptionalText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateWarrantyIntakeDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  coverageId: number;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(2000)
  reportedIssue: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  assignedToTechnicianId?: number;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  technicianOverrideReason?: string;

  @IsEnum(EquipmentType)
  @IsOptional()
  equipmentType?: EquipmentType;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  equipmentTypeOther?: string;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  brand?: string;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(150)
  @IsOptional()
  model?: string;

  @Transform(trimOptionalText)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  serialNumber?: string;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  accessories?: string;

  @IsEnum(ServiceOrderPriority)
  @IsOptional()
  priority?: ServiceOrderPriority;

  @Transform(trimOptionalText)
  @IsString()
  @IsOptional()
  notes?: string;
}
