import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualDeliveryLineDto {
  @IsInt() @Min(1) productId: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) quantity: number;
  @IsOptional() @IsInt() @Min(1) lotId?: number;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  serialIds?: number[];
}

export class CreateManualDeliveryDto {
  @IsUUID() requestKey: string;
  @IsInt() @Min(1) technicianId: number;
  @IsOptional() @IsInt() @Min(1) serviceOrderId?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ManualDeliveryLineDto)
  lines: ManualDeliveryLineDto[];
}
