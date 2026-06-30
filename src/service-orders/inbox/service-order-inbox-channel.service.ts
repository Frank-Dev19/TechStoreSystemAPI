import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { normalizePhoneForMetaRecipient } from '../../common/utils/phone.util';
import { ServiceOrderInboxAttachmentType } from './service-order-inbox.types';
import { ServiceOrderInboxWebhookAttachmentDto } from './dto/service-order-inbox-webhook.dto';
import { ServiceOrderInboxWebhookStatusDto } from './dto/service-order-inbox-webhook-status.dto';

type OutboundAttachmentPayload = {
  id: number;
  type: ServiceOrderInboxAttachmentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64Data?: string | null;
};

type DispatchOutboundPayload = {
  threadId: number;
  serviceOrderId: number;
  contextToken: string;
  clientPhone: string | null;
  text: string | null;
  authorRole: string;
  authorDisplayName: string | null;
  attachments: OutboundAttachmentPayload[];
};

type DispatchTemplateMessageInput = {
  clientPhone: string | null;
  templateName: string;
  languageCode: string;
  documentUrl?: string | null;
  documentFileName?: string | null;
  bodyParameters: string[];
  quickReplyPayloads?: string[];
  contextToken: string;
};

export type DispatchOutboundResult = {
  status: string;
  externalMessageId?: string | null;
  providerPayload?: unknown;
  providerMediaId?: string | null;
  providerUrl?: string | null;
};

export type NormalizedInboundMessage = {
  serviceOrderId?: number;
  contextToken?: string | null;
  externalThreadKey?: string | null;
  from?: string | null;
  senderName?: string | null;
  text?: string | null;
  externalMessageId: string;
  occurredAt?: string | null;
  replyToExternalMessageId?: string | null;
  attachments?: ServiceOrderInboxWebhookAttachmentDto[];
};

export type NormalizedMetaWebhookPayload = {
  messages: NormalizedInboundMessage[];
  statuses: ServiceOrderInboxWebhookStatusDto[];
};

type MetaMediaDownloadResult = {
  buffer: Buffer;
  mimeType: string;
};

@Injectable()
export class ServiceOrderInboxChannelService {
  private readonly logger = new Logger(ServiceOrderInboxChannelService.name);
  private readonly graphBaseUrl: string;
  private readonly apiVersion: string;
  private readonly phoneNumberId: string | null;
  private readonly accessToken: string | null;

  constructor(private readonly configService: ConfigService) {
    this.graphBaseUrl = (this.configService.get<string>('WHATSAPP_CLOUD_API_BASE_URL') || 'https://graph.facebook.com').replace(
      /\/+$/,
      '',
    );
    this.apiVersion = this.configService.get<string>('WHATSAPP_CLOUD_API_VERSION') || 'v23.0';
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_CLOUD_PHONE_NUMBER_ID') || null;
    this.accessToken = this.configService.get<string>('WHATSAPP_CLOUD_ACCESS_TOKEN') || null;
  }

  verifyWebhookChallenge(mode?: string, verifyToken?: string, challenge?: string): string {
    const expectedToken = this.configService.get<string>('WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN');
    if (mode !== 'subscribe' || !challenge) {
      throw new BadRequestException('Webhook challenge invalido');
    }
    if (!expectedToken || verifyToken !== expectedToken) {
      throw new ForbiddenException('Webhook verify token invalido');
    }
    return challenge;
  }

  assertWebhookSignature(rawBody: Buffer | undefined, signatureHeader?: string): void {
    const appSecret = this.configService.get<string>('WHATSAPP_CLOUD_APP_SECRET');
    if (!appSecret) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new InternalServerErrorException('WHATSAPP_CLOUD_APP_SECRET es obligatorio en produccion');
      }
      this.logger.warn('Webhook signature validation skipped because WHATSAPP_CLOUD_APP_SECRET is not configured');
      return;
    }
    if (!rawBody?.length || !signatureHeader) {
      throw new ForbiddenException('Firma de webhook faltante');
    }

    const [algorithm, receivedSignature] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !receivedSignature) {
      throw new ForbiddenException('Formato de firma invalido');
    }

    const expectedSignature = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new ForbiddenException('Firma de webhook invalida');
    }
  }

  normalizeWebhookPayload(payload: any): NormalizedMetaWebhookPayload {
    const messages: NormalizedInboundMessage[] = [];
    const statuses: ServiceOrderInboxWebhookStatusDto[] = [];
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];

    entries.forEach((entry: any) => {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      changes.forEach((change: any) => {
        const value = change?.value ?? {};
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactNames = new Map<string, string>();
        contacts.forEach((contact: any) => {
          const waId = String(contact?.wa_id ?? '').trim();
          const name = String(contact?.profile?.name ?? '').trim();
          if (waId && name) {
            contactNames.set(waId, name);
          }
        });

        const inboundMessages = Array.isArray(value.messages) ? value.messages : [];
        inboundMessages.forEach((message: any) => {
          const from = String(message?.from ?? '').trim() || null;
          const senderName = from ? contactNames.get(from) || null : null;
          const normalizedAttachments = this.extractInboundAttachments(message);
          const normalizedText = typeof message?.text?.body === 'string' ? message.text.body.trim() : null;
          const contextToken =
            String(
              message?.context?.biz_opaque_callback_data ??
                message?.biz_opaque_callback_data ??
                value?.biz_opaque_callback_data ??
                '',
            ).trim() || null;

          messages.push({
            externalMessageId: String(message?.id ?? '').trim(),
            contextToken,
            externalThreadKey: contextToken,
            from,
            senderName,
            text: normalizedText,
            occurredAt: this.normalizeMetaTimestamp(message?.timestamp),
            replyToExternalMessageId: String(message?.context?.id ?? '').trim() || null,
            attachments: normalizedAttachments,
          });
        });

        const inboundStatuses = Array.isArray(value.statuses) ? value.statuses : [];
        inboundStatuses.forEach((status: any) => {
          statuses.push({
            externalMessageId: String(status?.id ?? '').trim(),
            status: String(status?.status ?? '').trim().toUpperCase() as any,
            occurredAt: this.normalizeMetaTimestamp(status?.timestamp) || undefined,
            rawPayload: status,
          });
        });
      });
    });

    return {
      messages: messages.filter((message) => message.externalMessageId),
      statuses: statuses.filter((status) => status.externalMessageId),
    };
  }

  async dispatchTextMessage(payload: DispatchOutboundPayload): Promise<DispatchOutboundResult> {
    this.ensureMetaConfigured();
    const phone = this.normalizeRecipientPhone(payload.clientPhone);

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: {
        body: payload.text || '',
        preview_url: false,
      },
      biz_opaque_callback_data: payload.contextToken,
    };

    const providerPayload = await this.metaJsonRequest(this.buildGraphUrl(`${this.phoneNumberId}/messages`), {
      method: 'POST',
      body,
    });

    return {
      status: 'SENT',
      externalMessageId: this.extractSentMessageId(providerPayload),
      providerPayload,
    };
  }

  async dispatchAttachmentMessage(
    payload: DispatchOutboundPayload,
    attachment: OutboundAttachmentPayload,
  ): Promise<DispatchOutboundResult> {
    this.ensureMetaConfigured();
    const phone = this.normalizeRecipientPhone(payload.clientPhone);
    const mediaId = await this.uploadMedia(attachment);

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: this.mapAttachmentToMetaType(attachment.type),
      biz_opaque_callback_data: payload.contextToken,
      [this.mapAttachmentToMetaType(attachment.type)]: this.buildAttachmentMessagePayload(attachment, mediaId),
    };

    const providerPayload = await this.metaJsonRequest(this.buildGraphUrl(`${this.phoneNumberId}/messages`), {
      method: 'POST',
      body,
    });

    return {
      status: 'SENT',
      externalMessageId: this.extractSentMessageId(providerPayload),
      providerPayload,
      providerMediaId: mediaId,
      providerUrl: null,
    };
  }

  async dispatchTemplateMessage(payload: DispatchTemplateMessageInput): Promise<DispatchOutboundResult> {
    this.ensureMetaConfigured();
    const phone = this.normalizeRecipientPhone(payload.clientPhone);

    const components: Array<Record<string, unknown>> = [];
    if (payload.documentUrl?.trim()) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: payload.documentUrl,
              filename: payload.documentFileName ?? undefined,
            },
          },
        ],
      });
    }

    components.push({
      type: 'body',
      parameters: payload.bodyParameters.map((parameter) => ({
        type: 'text',
        text: parameter,
      })),
    });

    (payload.quickReplyPayloads ?? []).forEach((quickReplyPayload, index) => {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(index),
        parameters: [
          {
            type: 'payload',
            payload: quickReplyPayload,
          },
        ],
      });
    });

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      biz_opaque_callback_data: payload.contextToken,
      template: {
        name: payload.templateName,
        language: { code: payload.languageCode },
        components,
      },
    };

    const providerPayload = await this.metaJsonRequest(this.buildGraphUrl(`${this.phoneNumberId}/messages`), {
      method: 'POST',
      body,
    });

    return {
      status: 'SENT',
      externalMessageId: this.extractSentMessageId(providerPayload),
      providerPayload,
    };
  }

  async downloadInboundMedia(mediaId: string): Promise<MetaMediaDownloadResult> {
    this.ensureMetaConfigured();
    const metadata = await this.metaJsonRequest(this.buildGraphUrl(mediaId), {
      method: 'GET',
    });

    const providerUrl = String((metadata as Record<string, unknown>)?.url ?? '').trim();
    if (!providerUrl) {
      throw new Error('Meta media URL not found');
    }

    const response = await fetch(providerUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Meta media download failed with status ${response.status}: ${errorText}`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType:
        String((metadata as Record<string, unknown>)?.mime_type ?? '').trim() ||
        response.headers.get('content-type') ||
        'application/octet-stream',
    };
  }

  private extractInboundAttachments(message: any): ServiceOrderInboxWebhookAttachmentDto[] {
    const messageType = String(message?.type ?? '').trim().toLowerCase();
    if (!messageType) {
      return [];
    }

    if (messageType === 'image' && message?.image?.id) {
      return [
        {
          type: ServiceOrderInboxAttachmentType.IMAGE,
          fileName: `image-${message.image.id}.jpg`,
          mimeType: String(message?.image?.mime_type ?? 'image/jpeg'),
          providerMediaId: String(message.image.id),
        },
      ];
    }

    if (messageType === 'audio' && message?.audio?.id) {
      return [
        {
          type: ServiceOrderInboxAttachmentType.AUDIO,
          fileName: `audio-${message.audio.id}.mp3`,
          mimeType: String(message?.audio?.mime_type ?? 'audio/mpeg'),
          providerMediaId: String(message.audio.id),
        },
      ];
    }

    if (messageType === 'document' && message?.document?.id) {
      const mimeType = String(message?.document?.mime_type ?? 'application/octet-stream');
      const attachmentType =
        mimeType.toLowerCase() === 'application/pdf'
          ? ServiceOrderInboxAttachmentType.PDF
          : ServiceOrderInboxAttachmentType.DOCUMENT;
      return [
        {
          type: attachmentType,
          fileName: String(message?.document?.filename ?? `document-${message.document.id}`),
          mimeType,
          providerMediaId: String(message.document.id),
        },
      ];
    }

    return [];
  }

  private normalizeMetaTimestamp(timestamp: unknown): string | null {
    const raw = String(timestamp ?? '').trim();
    if (!raw) {
      return null;
    }

    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber * 1000).toISOString();
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private extractSentMessageId(providerPayload: unknown): string | null {
    const messages = (providerPayload as Record<string, any> | undefined)?.messages;
    if (!Array.isArray(messages) || !messages.length) {
      return null;
    }
    const rawId = String(messages[0]?.id ?? '').trim();
    return rawId || null;
  }

  private mapAttachmentToMetaType(type: ServiceOrderInboxAttachmentType): 'image' | 'audio' | 'document' {
    switch (type) {
      case ServiceOrderInboxAttachmentType.IMAGE:
        return 'image';
      case ServiceOrderInboxAttachmentType.AUDIO:
        return 'audio';
      case ServiceOrderInboxAttachmentType.PDF:
      case ServiceOrderInboxAttachmentType.DOCUMENT:
      default:
        return 'document';
    }
  }

  private buildAttachmentMessagePayload(attachment: OutboundAttachmentPayload, mediaId: string) {
    if (attachment.type === ServiceOrderInboxAttachmentType.IMAGE) {
      return { id: mediaId };
    }
    if (attachment.type === ServiceOrderInboxAttachmentType.AUDIO) {
      return { id: mediaId };
    }
    return {
      id: mediaId,
      filename: attachment.fileName,
    };
  }

  private async uploadMedia(attachment: OutboundAttachmentPayload): Promise<string> {
    const base64Data = attachment.base64Data?.trim();
    if (!base64Data) {
      throw new BadRequestException('Attachment payload missing binary data');
    }

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', attachment.mimeType);
    formData.append(
      'file',
      new Blob([Buffer.from(base64Data, 'base64')], { type: attachment.mimeType }),
      attachment.fileName,
    );

    const response = await fetch(this.buildGraphUrl(`${this.phoneNumberId}/media`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: formData,
    });

    const rawText = await response.text();
    const providerPayload = this.tryParseJson(rawText);
    if (!response.ok) {
      throw new Error(`Meta media upload failed with status ${response.status}: ${rawText}`);
    }

    const mediaId = String((providerPayload as Record<string, unknown>)?.id ?? '').trim();
    if (!mediaId) {
      throw new Error('Meta media upload did not return a media id');
    }
    return mediaId;
  }

  private async metaJsonRequest(
    url: string,
    options: {
      method: 'GET' | 'POST';
      body?: unknown;
    },
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const rawText = await response.text();
    const providerPayload = this.tryParseJson(rawText);

    if (!response.ok) {
      this.logger.warn(`Meta request failed with status ${response.status}`);
      throw new Error(`Meta request failed with status ${response.status}: ${rawText}`);
    }

    return providerPayload;
  }

  private ensureMetaConfigured(): void {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new BadRequestException('Meta Cloud API is not configured');
    }
  }

  private normalizeRecipientPhone(phone: string | null): string {
    const normalized = normalizePhoneForMetaRecipient(phone);
    if (!normalized) {
      throw new BadRequestException('The thread does not have a valid client phone');
    }
    return normalized;
  }

  private buildGraphUrl(path: string): string {
    const normalizedPath = String(path).replace(/^\/+/, '');
    return `${this.graphBaseUrl}/${this.apiVersion}/${normalizedPath}`;
  }

  private tryParseJson(value: string): unknown {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
