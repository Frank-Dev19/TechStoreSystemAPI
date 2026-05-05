import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType } from '../enums/document-type.enum';
import { SaleType } from '../enums/sale-type.enum';
import { SalePaymentDto } from './create-sale.dto';

export class CreateSaleFromServiceAgreementsDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  serviceOrderIds: number[];

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  taxpayerCustomerId: number;

  @IsOptional()
  @IsEnum(SaleType)
  saleType?: SaleType;

  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsDateString()
  issueDate: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}
