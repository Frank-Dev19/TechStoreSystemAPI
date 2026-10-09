import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInternalSupplyRequestDto {
  @IsInt() @Min(1) productId: number;
  @IsOptional() @IsInt() @Min(1) serviceOrderId?: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) quantity: number;
  @IsString() @MaxLength(1000) reason: string;
}

export class FulfillDispatchRequestDto {
  @IsUUID() requestKey: string;
  @IsOptional() @IsInt() @Min(1) lotId?: number;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  serialIds?: number[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class RejectDispatchRequestDto {
  @IsString() @MaxLength(1000) reason: string;
}

export class FulfillExternalReplacementDto {
  @IsUUID() requestKey: string;
  @IsString() @MaxLength(255) productName: string;
  @IsOptional() @IsString() @MaxLength(100) productCode?: string;
  @IsOptional() @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @IsString() @MaxLength(150) model?: string;
  @IsString() @MaxLength(100) serialCode: string;
  @IsString() @MaxLength(200) externalReference: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
