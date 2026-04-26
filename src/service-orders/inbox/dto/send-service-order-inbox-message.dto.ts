import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendServiceOrderInboxMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;
}
