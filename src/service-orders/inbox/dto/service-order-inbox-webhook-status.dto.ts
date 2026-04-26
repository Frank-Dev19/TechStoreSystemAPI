import { IsObject, IsOptional, IsString } from 'class-validator';
import { ServiceOrderInboxDeliveryStatus } from '../service-order-inbox.types';

export class ServiceOrderInboxWebhookStatusDto {
  @IsOptional()
  @IsString()
  externalMessageId?: string;

  @IsOptional()
  @IsString()
  status?: ServiceOrderInboxDeliveryStatus | string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: unknown;
}
