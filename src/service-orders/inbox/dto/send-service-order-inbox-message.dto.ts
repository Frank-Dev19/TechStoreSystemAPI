import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SendServiceOrderInboxMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((entry) => Number(entry))
      : String(value ?? '')
          .split(',')
          .map((entry) => Number(entry.trim()))
          .filter((entry) => Number.isFinite(entry)),
  )
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  serviceOrderIds?: number[];
}
