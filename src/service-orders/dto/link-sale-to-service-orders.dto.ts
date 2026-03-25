import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsPositive } from 'class-validator';

export class LinkSaleToServiceOrdersDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  saleId: number;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  serviceOrderIds: number[];
}
