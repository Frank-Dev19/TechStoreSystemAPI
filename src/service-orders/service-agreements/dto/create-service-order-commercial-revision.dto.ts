import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ServiceOrderCommercialLineType } from '../service-order-commercial-line-type.enum';
import { WarrantyDurationUnit } from '../../../common/enums/warranty-duration-unit.enum';

export class CreateServiceOrderCommercialRevisionLineDto {
  @IsEnum(ServiceOrderCommercialLineType)
  type: ServiceOrderCommercialLineType;

  @ValidateIf(
    (line: CreateServiceOrderCommercialRevisionLineDto) =>
      line.type === ServiceOrderCommercialLineType.PRODUCT,
  )
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

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPct?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  discountOverrideReason?: string;

  @IsBoolean()
  @IsOptional()
  requiresPurchase?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateServiceOrderCommercialRevisionItemDto {
  @IsNumber()
  @IsPositive()
  serviceOrderItemId: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  baseVersionId?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  warrantyDurationValue?: number;

  @IsEnum(WarrantyDurationUnit)
  @IsOptional()
  warrantyDurationUnit?: WarrantyDurationUnit;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderCommercialRevisionLineDto)
  lines: CreateServiceOrderCommercialRevisionLineDto[];
}

export class CreateServiceOrderCommercialRevisionDto {
  @IsNumber()
  @IsPositive()
  serviceOrderId: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderCommercialRevisionItemDto)
  items: CreateServiceOrderCommercialRevisionItemDto[];
}
