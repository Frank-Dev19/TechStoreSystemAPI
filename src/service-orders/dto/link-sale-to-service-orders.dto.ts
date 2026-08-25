import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsPositive } from 'class-validator';

export class LinkSaleToServiceOrdersDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  saleId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1, { message: 'Cada comprobante de servicio debe corresponder a una sola orden' })
  @Type(() => Number)
  @IsInt({ each: true })
  serviceOrderIds: number[];
}
