import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MaterialRequestDto {
  @IsUUID() requestKey: string;
}
export class MaterialIssueLineDto {
  @IsInt() @Min(1) commercialLineId: number;
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
export class MaterialIssueDto extends MaterialRequestDto {
  @IsInt() @Min(1) versionId: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaterialIssueLineDto)
  lines: MaterialIssueLineDto[];
}
export class MaterialReturnDto extends MaterialRequestDto {
  @IsInt() @Min(1) deliveryLineId: number;
  @IsInt() @Equals(1) quantity: number;
  @IsBoolean() @Equals(true) faulty: boolean;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
export class MaterialReconcileDto extends MaterialRequestDto {
  @IsInt() @Min(1) versionId: number;
}
export class MaterialReviewDto extends MaterialRequestDto {
  @IsIn(['USABLE', 'UNUSABLE']) condition: 'USABLE' | 'UNUSABLE';
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
