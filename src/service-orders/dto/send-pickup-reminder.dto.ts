import { ArrayMinSize, IsArray, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class SendPickupReminderDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  itemIds: number[];
}
