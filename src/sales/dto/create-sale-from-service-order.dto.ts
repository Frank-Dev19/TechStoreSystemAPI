import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, ValidateNested, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType } from '../enums/document-type.enum';
import { SaleType } from '../enums/sale-type.enum';
import { SalePaymentDto } from './create-sale.dto';

export class CreateSaleFromServiceOrderDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  serviceOrderId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId: number;

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
