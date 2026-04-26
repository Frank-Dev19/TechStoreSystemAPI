import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceOrderInboxAttachmentType } from '../service-order-inbox.types';

export class ServiceOrderInboxWebhookAttachmentDto {
  @IsOptional()
  @IsString()
  type?: ServiceOrderInboxAttachmentType | string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  providerMediaId?: string;

  @IsOptional()
  @IsString()
  providerUrl?: string;

  @IsOptional()
  @IsString()
  base64Data?: string;
}

export class ServiceOrderInboxWebhookDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceOrderId?: number;

  @IsOptional()
  @IsString()
  contextToken?: string;

  @IsOptional()
  @IsString()
  externalThreadKey?: string;

  @IsOptional()
  @IsString()
  replyToExternalMessageId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsString()
  externalMessageId: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderInboxWebhookAttachmentDto)
  attachments?: ServiceOrderInboxWebhookAttachmentDto[];
}
