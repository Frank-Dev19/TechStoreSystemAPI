import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { basename, extname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderOperativeStatus } from '../enums';
import {
  ADMIN_ROLE_NAMES,
  RECEPTIONIST_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
  hasRoleName,
} from '../../common/constants/role-names';
import { normalizeComparablePhone as normalizeComparablePhoneValue } from '../../common/utils/phone.util';
import { ServiceOrderInboxThread } from './entities/service-order-inbox-thread.entity';
import { ServiceOrderInboxMessage } from './entities/service-order-inbox-message.entity';
import { ServiceOrderInboxAttachment } from './entities/service-order-inbox-attachment.entity';
import { ServiceOrderInboxThreadOrderLink } from './entities/service-order-inbox-thread-order-link.entity';
import { ServiceOrderInboxMessageOrderLink } from './entities/service-order-inbox-message-order-link.entity';
import {
  DispatchOutboundResult,
  NormalizedInboundMessage,
  ServiceOrderInboxChannelService,
} from './service-order-inbox-channel.service';
import { ServiceOrderInboxQueryDto } from './dto/service-order-inbox-query.dto';
import { SendServiceOrderInboxMessageDto } from './dto/send-service-order-inbox-message.dto';
import { ServiceOrderInboxWebhookAttachmentDto } from './dto/service-order-inbox-webhook.dto';
import { ServiceOrderInboxWebhookStatusDto } from './dto/service-order-inbox-webhook-status.dto';
import {
  ServiceOrderInboxAttachmentType,
  ServiceOrderInboxAuthorRole,
  ServiceOrderInboxDeliveryStatus,
  ServiceOrderInboxDirection,
  ServiceOrderInboxViewerRole,
} from './service-order-inbox.types';
import { PrivateFileStorageService } from '../storage/private-file-storage.service';

type InboxViewerContext = {
  userId: number | null;
  displayName: string | null;
  role: ServiceOrderInboxViewerRole;
};

type StoredAttachmentPayload = {
  entity: ServiceOrderInboxAttachment;
  base64Data?: string | null;
};

type ThreadWithRelations = ServiceOrderInboxThread & {
  orderLinks?: ServiceOrderInboxThreadOrderLink[];
};

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type OutboundPartialFailure = {
  stage: 'text' | 'attachment';
  messageId: number;
  attachmentId?: number;
  fileName?: string;
  error: string;
};

const TERMINAL_OPERATIVE_STATUSES: ServiceOrderOperativeStatus[] = [
  ServiceOrderOperativeStatus.ENTREGADA,
  ServiceOrderOperativeStatus.CANCELADA,
  ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
];

const MAX_PAGE_SIZE = 100;
const MAX_ATTACHMENT_SIZE_BYTES = 16 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

@Injectable()
export class ServiceOrderInboxService {
  private readonly logger = new Logger(ServiceOrderInboxService.name);

  constructor(
    @InjectRepository(ServiceOrderInboxThread)
    private readonly threadRepository: Repository<ServiceOrderInboxThread>,
    @InjectRepository(ServiceOrderInboxMessage)
    private readonly messageRepository: Repository<ServiceOrderInboxMessage>,
    @InjectRepository(ServiceOrderInboxAttachment)
    private readonly attachmentRepository: Repository<ServiceOrderInboxAttachment>,
    @InjectRepository(ServiceOrderInboxThreadOrderLink)
    private readonly threadOrderLinkRepository: Repository<ServiceOrderInboxThreadOrderLink>,
    @InjectRepository(ServiceOrderInboxMessageOrderLink)
    private readonly messageOrderLinkRepository: Repository<ServiceOrderInboxMessageOrderLink>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    private readonly channelService: ServiceOrderInboxChannelService,
    private readonly privateFileStorage: PrivateFileStorageService,
  ) {}

  buildViewerContext(user: any): InboxViewerContext {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const userId = Number(user?.sub ?? user?.id ?? 0) || null;
    const displayName = typeof user?.name === 'string' ? user.name : null;

    if (hasRoleName(roles, ADMIN_ROLE_NAMES)) {
      return { userId, displayName, role: 'ADMIN' };
    }
    if (hasRoleName(roles, SUPERVISOR_ROLE_NAMES)) {
      return { userId, displayName, role: 'SUPERVISOR' };
    }
    if (hasRoleName(roles, RECEPTIONIST_ROLE_NAMES)) {
      return { userId, displayName, role: 'RECEPTION' };
    }
    if (hasRoleName(roles, TECHNICIAN_ROLE_NAMES)) {
      return { userId, displayName, role: 'TECHNICIAN' };
    }
    return { userId, displayName, role: 'ADMIN' };
  }

  async getThreadForServiceOrder(serviceOrderId: number, viewer: InboxViewerContext) {
    const thread = await this.ensureThreadForOrder(serviceOrderId, viewer);
    return this.mapThreadSummary(thread, viewer);
  }

  async listThreadOrders(threadId: number, viewer: InboxViewerContext) {
    const thread = await this.getThreadWithAccess(threadId, viewer);
    return this.mapThreadOrders(thread, viewer);
  }

  async replaceMessageOrderLinks(messageId: number, serviceOrderIds: number[], viewer: InboxViewerContext) {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['thread', 'thread.orderLinks', 'thread.orderLinks.serviceOrder', 'orderLinks'],
    });
    if (!message?.thread) {
      throw new NotFoundException('Mensaje no encontrado');
    }

    await this.ensureThreadAccess(message.thread as ThreadWithRelations, viewer, true);
    this.ensureMessageScopedAccess(message, message.thread as ThreadWithRelations, viewer, true);

    const normalizedIds = this.resolveRequestedServiceOrderIds(message.thread as ThreadWithRelations, serviceOrderIds, viewer);

    const existingLinks = await this.messageOrderLinkRepository.find({ where: { messageId } });
    if (existingLinks.length) {
      await this.messageOrderLinkRepository.remove(existingLinks);
    }

    if (normalizedIds.length) {
      await this.messageOrderLinkRepository.save(
        normalizedIds.map((serviceOrderId) =>
          this.messageOrderLinkRepository.create({
            messageId,
            serviceOrderId,
          }),
        ),
      );
    }

    return {
      ok: true,
      messageId,
      serviceOrderIds: normalizedIds,
    };
  }

  async hasThreadActivity(serviceOrderId: number): Promise<boolean> {
    const thread = await this.findThreadByServiceOrderId(serviceOrderId);
    return !!thread?.lastMessageAt;
  }

  async hasCustomerServiceWindow(serviceOrderId: number): Promise<boolean> {
    const thread = await this.findThreadByServiceOrderId(serviceOrderId);
    if (!thread?.lastCustomerMessageAt) {
      return false;
    }

    return Date.now() - thread.lastCustomerMessageAt.getTime() <= 24 * 60 * 60 * 1000;
  }

  private async hasManualOutboundWindow(
    thread: ThreadWithRelations,
    primaryServiceOrderId: number | null,
  ): Promise<boolean> {
    if (primaryServiceOrderId) {
      return this.hasCustomerServiceWindow(primaryServiceOrderId);
    }

    if (!thread.lastCustomerMessageAt) {
      return false;
    }

    return Date.now() - thread.lastCustomerMessageAt.getTime() <= 24 * 60 * 60 * 1000;
  }

  async syncThreadClientPhoneSnapshotForOrder(serviceOrderId: number, nextPhone: string | null | undefined): Promise<void> {
    const thread = await this.findThreadByServiceOrderId(serviceOrderId);
    if (!thread) {
      return;
    }

    const normalizedNextPhone = this.normalizeComparablePhone(nextPhone);
    if (thread.clientPhoneSnapshot === normalizedNextPhone) {
      return;
    }

    thread.clientPhoneSnapshot = normalizedNextPhone;
    await this.threadRepository.save(thread);
  }

  async consolidateHistoricalThreads(): Promise<number> {
    const threads = (await this.threadRepository.find({
      relations: [
        'orderLinks',
        'orderLinks.serviceOrder',
        'orderLinks.serviceOrder.assignedTechnician',
        'orderLinks.serviceOrder.client',
      ],
    })) as ThreadWithRelations[];

    const grouped = new Map<string, ThreadWithRelations[]>();
    for (const thread of threads) {
      const phone = this.normalizeComparablePhone(thread.clientPhoneSnapshot);
      if (!phone) {
        continue;
      }

      const existing = grouped.get(phone) ?? [];
      existing.push(thread);
      grouped.set(phone, existing);
    }

    let consolidatedCount = 0;
    for (const duplicates of grouped.values()) {
      if (duplicates.length <= 1) {
        continue;
      }

      await this.consolidateThreads(duplicates);
      consolidatedCount += duplicates.length - 1;
    }

    return consolidatedCount;
  }

  async listThreads(query: ServiceOrderInboxQueryDto, viewer: InboxViewerContext) {
    const page = this.normalizePositiveNumber(query.page, 1, MAX_PAGE_SIZE);
    const limit = this.normalizePositiveNumber(query.limit, 20, MAX_PAGE_SIZE);
    const serviceOrderId = query.serviceOrderId ? Number(query.serviceOrderId) : null;

    if (serviceOrderId && query.ensure) {
      await this.ensureThreadForOrder(serviceOrderId, viewer);
    }

    const qb = this.threadRepository
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.orderLinks', 'orderLink')
      .leftJoinAndSelect('orderLink.serviceOrder', 'serviceOrder')
      .leftJoinAndSelect('serviceOrder.assignedTechnician', 'assignedTechnician')
      .leftJoinAndSelect('serviceOrder.client', 'client');

    this.applyViewerScope(qb, viewer);

    if (serviceOrderId) {
      qb.andWhere('orderLink.serviceOrderId = :serviceOrderId', { serviceOrderId });
    }

    const search = query.search?.trim().toLowerCase();
    if (search) {
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(serviceOrder.code) LIKE :search')
            .orWhere('LOWER(serviceOrder.clientSnapshotName) LIKE :search')
            .orWhere('LOWER(serviceOrder.clientSnapshotDocumentNumber) LIKE :search')
            .orWhere('LOWER(serviceOrder.brand) LIKE :search')
            .orWhere('LOWER(serviceOrder.model) LIKE :search')
            .orWhere('LOWER(thread.clientDisplayNameSnapshot) LIKE :search');
        }),
        { search: `%${search}%` },
      );
    }

    qb.distinct(true)
      .orderBy('thread.lastMessageAt', 'DESC')
      .addOrderBy('thread.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [threads, total] = await qb.getManyAndCount();

    return {
      data: await Promise.all(threads.map((thread) => this.mapThreadSummary(thread as ThreadWithRelations, viewer))),
      total,
      page,
      limit,
    };
  }

  async getMessages(threadId: number, viewer: InboxViewerContext) {
    const thread = await this.getThreadWithAccess(threadId, viewer);
    const messages = await this.messageRepository.find({
      where: { threadId: thread.id },
      relations: ['attachments', 'orderLinks'],
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      thread: await this.mapThreadSummary(thread, viewer, messages),
      messages: this.filterVisibleMessages(messages, thread, viewer).map((message) => this.mapMessage(message, viewer, thread)),
    };
  }

  async markThreadAsRead(threadId: number, viewer: InboxViewerContext) {
    const thread = await this.getThreadWithAccess(threadId, viewer);
    const patch: Partial<ServiceOrderInboxThread> = {};

    switch (viewer.role) {
      case 'SUPERVISOR':
      case 'ADMIN':
        patch.unreadForSupervisor = 0;
        break;
      case 'RECEPTION':
        patch.unreadForReception = 0;
        break;
      case 'TECHNICIAN':
        patch.unreadForTechnician = 0;
        break;
      default:
        break;
    }

    await this.threadRepository.update({ id: thread.id }, patch);
    return { ok: true };
  }

  async sendMessage(
    threadId: number,
    dto: SendServiceOrderInboxMessageDto,
    files: UploadedFile[],
    viewer: InboxViewerContext,
  ) {
    const thread = await this.getThreadWithAccess(threadId, viewer, true);
    const normalizedText = dto.text?.trim() || null;
    if (!normalizedText && !files.length) {
      throw new BadRequestException('Debes enviar texto o al menos un adjunto');
    }

    const requestedServiceOrderIds = this.resolveRequestedServiceOrderIds(thread, dto.serviceOrderIds, viewer);
    const effectiveServiceOrderIds =
      requestedServiceOrderIds.length > 0 ? requestedServiceOrderIds : this.resolveDefaultMessageServiceOrderIds(thread, viewer);
    const primaryServiceOrderId = effectiveServiceOrderIds[0] ?? this.resolvePrimaryServiceOrderId(thread, viewer);
    const hasCustomerServiceWindow = await this.hasManualOutboundWindow(thread, primaryServiceOrderId);
    if (!hasCustomerServiceWindow) {
      throw new BadRequestException(
        'No se pueden enviar mensajes manuales porque la ventana de 24 horas de WhatsApp está cerrada.',
      );
    }

    const dispatchPayload = {
      threadId: thread.id,
      serviceOrderId: primaryServiceOrderId ?? 0,
      contextToken: thread.externalThreadKey,
      clientPhone: thread.clientPhoneSnapshot,
      authorRole: this.resolveAuthorRole(viewer.role),
      authorDisplayName: viewer.displayName,
    };

    const successfulMessageIds: number[] = [];
    const partialFailures: OutboundPartialFailure[] = [];
    let firstDispatchError: unknown = null;
    const threadUpdateOptions = {
      incrementSupervisorUnread:
        viewer.role === 'TECHNICIAN' || viewer.role === 'RECEPTION',
      resetReceptionUnread: viewer.role === 'RECEPTION',
      resetTechnicianUnread: viewer.role === 'TECHNICIAN',
      resetSupervisorUnread: viewer.role === 'SUPERVISOR' || viewer.role === 'ADMIN',
    };

    if (normalizedText) {
      const textMessage = await this.messageRepository.save(
        this.messageRepository.create({
          threadId: thread.id,
          direction: ServiceOrderInboxDirection.OUTBOUND,
          authorRole: dispatchPayload.authorRole,
          authorUserId: viewer.userId,
          authorDisplayName: viewer.displayName,
          text: normalizedText,
          deliveryStatus: ServiceOrderInboxDeliveryStatus.QUEUED,
        }),
      );
      await this.associateMessageWithOrders(textMessage.id, effectiveServiceOrderIds);

      try {
        const dispatchResult = await this.channelService.dispatchTextMessage({
          ...dispatchPayload,
          text: normalizedText,
          attachments: [],
        });

        await this.finalizeOutboundMessage(thread, textMessage, dispatchResult, threadUpdateOptions);
      } catch (error) {
        await this.finalizeOutboundMessage(
          thread,
          textMessage,
          {
            status: ServiceOrderInboxDeliveryStatus.FAILED,
            providerPayload: {
              error: error instanceof Error ? error.message : 'dispatch-failed',
            },
          },
          threadUpdateOptions,
        );
        partialFailures.push({
          stage: 'text',
          messageId: textMessage.id,
          error: error instanceof Error ? error.message : 'dispatch-failed',
        });
        firstDispatchError ??= error;
      }

      if (textMessage.deliveryStatus !== ServiceOrderInboxDeliveryStatus.FAILED) {
        successfulMessageIds.push(textMessage.id);
      }
    }

    for (const file of files ?? []) {
      this.validateUploadedFile(file);
      const attachmentMessage = await this.messageRepository.save(
        this.messageRepository.create({
          threadId: thread.id,
          direction: ServiceOrderInboxDirection.OUTBOUND,
          authorRole: dispatchPayload.authorRole,
          authorUserId: viewer.userId,
          authorDisplayName: viewer.displayName,
          text: null,
          deliveryStatus: ServiceOrderInboxDeliveryStatus.QUEUED,
        }),
      );
      await this.associateMessageWithOrders(attachmentMessage.id, effectiveServiceOrderIds);

      const storedAttachment = await this.persistUploadedAttachment(attachmentMessage, file);
      try {
        const dispatchResult = await this.channelService.dispatchAttachmentMessage(
          {
            ...dispatchPayload,
            text: null,
            attachments: [
              {
                id: storedAttachment.entity.id,
                type: storedAttachment.entity.attachmentType,
                fileName: storedAttachment.entity.fileName,
                mimeType: storedAttachment.entity.mimeType,
                sizeBytes: Number(storedAttachment.entity.sizeBytes || 0),
                base64Data: storedAttachment.base64Data ?? null,
              },
            ],
          },
          {
            id: storedAttachment.entity.id,
            type: storedAttachment.entity.attachmentType,
            fileName: storedAttachment.entity.fileName,
            mimeType: storedAttachment.entity.mimeType,
            sizeBytes: Number(storedAttachment.entity.sizeBytes || 0),
            base64Data: storedAttachment.base64Data ?? null,
          },
        );

        storedAttachment.entity.providerMediaId = dispatchResult.providerMediaId ?? null;
        storedAttachment.entity.providerUrl = dispatchResult.providerUrl ?? null;
        await this.attachmentRepository.save(storedAttachment.entity);

        await this.finalizeOutboundMessage(thread, attachmentMessage, dispatchResult, threadUpdateOptions);
      } catch (error) {
        await this.finalizeOutboundMessage(
          thread,
          attachmentMessage,
          {
            status: ServiceOrderInboxDeliveryStatus.FAILED,
            providerPayload: {
              error: error instanceof Error ? error.message : 'dispatch-failed',
            },
          },
          threadUpdateOptions,
        );
        partialFailures.push({
          stage: 'attachment',
          messageId: attachmentMessage.id,
          attachmentId: storedAttachment.entity.id,
          fileName: storedAttachment.entity.fileName,
          error: error instanceof Error ? error.message : 'dispatch-failed',
        });
        firstDispatchError ??= error;
        continue;
      }

      successfulMessageIds.push(attachmentMessage.id);
    }

    const lastMessageId = successfulMessageIds[successfulMessageIds.length - 1];
    if (!lastMessageId) {
      throw (firstDispatchError as Error | undefined) ?? new BadRequestException('No se pudo enviar el mensaje al canal');
    }

    const reloaded = lastMessageId
      ? await this.messageRepository.findOne({
          where: { id: lastMessageId },
          relations: ['attachments', 'orderLinks'],
        })
      : null;

    if (!reloaded) {
      throw new NotFoundException('No se pudo recuperar el mensaje enviado');
    }

    return {
      ...this.mapMessage(reloaded),
      partialFailures,
    };
  }

  async receiveInboundMessage(payload: NormalizedInboundMessage) {
    const dedupe = await this.messageRepository.findOne({
      where: { externalMessageId: payload.externalMessageId },
      relations: ['attachments', 'orderLinks'],
    });
    if (dedupe) {
      return this.mapMessage(dedupe);
    }

    const thread = await this.resolveInboundThread(payload);
    const relatedServiceOrderIds = await this.resolveInboundServiceOrderIds(thread, payload);
    const normalizedText = payload.text?.trim() || null;
    const attachments = payload.attachments ?? [];
    if (!normalizedText && !attachments.length) {
      this.logWebhookRoutingIssue('invalid-message-content', payload);
      throw new BadRequestException('El webhook no contiene texto ni adjuntos (invalid-message-content)');
    }

    const message = await this.messageRepository.save(
      this.messageRepository.create({
        threadId: thread.id,
        direction: ServiceOrderInboxDirection.INBOUND,
        authorRole: ServiceOrderInboxAuthorRole.CLIENT,
        authorUserId: null,
        authorDisplayName: payload.senderName?.trim() || payload.from?.trim() || null,
        text: normalizedText,
        deliveryStatus: ServiceOrderInboxDeliveryStatus.RECEIVED,
        externalMessageId: payload.externalMessageId,
      }),
    );
    await this.associateMessageWithOrders(message.id, relatedServiceOrderIds);

    await this.persistInboundAttachments(message, attachments);
    await this.refreshThreadAfterMessage(thread, message, {
      incrementReceptionUnread: this.hasActiveOrders(thread),
      incrementTechnicianUnread: this.hasTechnicianVisibleActiveOrders(thread),
      incrementSupervisorUnread: true,
      markCustomerActivity: true,
    });

    const reloaded = await this.messageRepository.findOne({
      where: { id: message.id },
      relations: ['attachments', 'orderLinks'],
    });
    if (!reloaded) {
      throw new NotFoundException('No se pudo recuperar el mensaje entrante');
    }
    return this.mapMessage(reloaded);
  }

  async updateDeliveryStatus(payload: ServiceOrderInboxWebhookStatusDto) {
    if (!payload.externalMessageId) {
      throw new BadRequestException('externalMessageId es obligatorio');
    }

    const message = await this.messageRepository.findOne({
      where: { externalMessageId: payload.externalMessageId },
    });
    if (!message) {
      this.logger.warn(
        `service-order-inbox webhook-status ignored reason=unknown-external-message-id externalMessageId=${payload.externalMessageId} status=${String(payload.status ?? '').trim().toUpperCase() || 'UNKNOWN'}`,
      );
      return { ok: false, reason: 'unknown-external-message-id' };
    }

    message.deliveryStatus = this.normalizeDeliveryStatus(payload.status);
    message.providerPayload = payload.rawPayload ? JSON.stringify(payload.rawPayload) : message.providerPayload;
    await this.messageRepository.save(message);
    return { ok: true };
  }

  async downloadAttachment(attachmentId: number, viewer: InboxViewerContext) {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId },
      relations: [
        'message',
        'message.orderLinks',
        'message.thread',
        'message.thread.orderLinks',
        'message.thread.orderLinks.serviceOrder',
        'message.thread.orderLinks.serviceOrder.assignedTechnician',
      ],
    });

    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado');
    }

    await this.ensureThreadAccess(attachment.message.thread, viewer, false);
    this.ensureMessageScopedAccess(attachment.message, attachment.message.thread as ThreadWithRelations, viewer, false);

    if (attachment.cachedFilePath) {
      const absolutePath = resolve(attachment.cachedFilePath);
      await fs.access(absolutePath);
      return {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        absolutePath,
      };
    }

    if (!attachment.providerMediaId) {
      throw new NotFoundException('No hay archivo disponible para descargar');
    }

    if (!attachment.cachedFilePath) {
      const downloadedMedia = await this.channelService.downloadInboundMedia(attachment.providerMediaId);
      const stored = await this.storeBinaryFile(
        attachment.message.threadId,
        attachment.fileName,
        attachment.attachmentType,
        downloadedMedia.buffer,
      );

      attachment.cachedFilePath = stored.absolutePath;
      attachment.mimeType = attachment.mimeType || downloadedMedia.mimeType;
      await this.attachmentRepository.save(attachment);

      return {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType || downloadedMedia.mimeType,
        absolutePath: stored.absolutePath,
      };
    }

    throw new NotFoundException('No hay archivo disponible para descargar');
  }

  private async resolveInboundThread(payload: NormalizedInboundMessage) {
    const contextToken = payload.contextToken?.trim() || payload.externalThreadKey?.trim() || null;
    let hadContextToken = false;
    if (contextToken) {
      hadContextToken = true;
      const existing = await this.threadRepository.findOne({
        where: { externalThreadKey: contextToken },
        relations: ['orderLinks', 'orderLinks.serviceOrder', 'orderLinks.serviceOrder.assignedTechnician', 'orderLinks.serviceOrder.client'],
      });
      if (existing) {
        return existing as ThreadWithRelations;
      }
    }

    const replyToExternalMessageId = payload.replyToExternalMessageId?.trim() || null;
    let hadReplyReference = false;
    if (replyToExternalMessageId) {
      hadReplyReference = true;
      const referencedMessage = await this.messageRepository.findOne({
        where: { externalMessageId: replyToExternalMessageId },
        relations: ['thread', 'thread.orderLinks', 'thread.orderLinks.serviceOrder', 'thread.orderLinks.serviceOrder.assignedTechnician', 'thread.orderLinks.serviceOrder.client'],
      });
      if (referencedMessage?.thread) {
        return referencedMessage.thread as ThreadWithRelations;
      }
    }

    const normalizedPhone = this.normalizeComparablePhone(payload.from);
    if (normalizedPhone) {
      const phoneMatches = await this.threadRepository.find({
        where: { clientPhoneSnapshot: normalizedPhone },
        relations: ['orderLinks', 'orderLinks.serviceOrder', 'orderLinks.serviceOrder.assignedTechnician', 'orderLinks.serviceOrder.client'],
      });

      if (phoneMatches.length >= 1) {
        return this.consolidateThreads(phoneMatches as ThreadWithRelations[]);
      }
    }

    if (payload.serviceOrderId) {
      return this.ensureThreadForOrder(payload.serviceOrderId, { role: 'SUPERVISOR', userId: null, displayName: null });
    }

    if (normalizedPhone) {
      return this.createInboundThreadFromPhone(payload, normalizedPhone);
    }

    const reason = hadContextToken
      ? 'unmatched-context-token'
      : hadReplyReference
        ? 'unmatched-reply-reference'
        : 'missing-routing-data';
    this.logWebhookRoutingIssue(reason, payload, {
      normalizedFrom: normalizedPhone,
      hasContextToken: hadContextToken,
      hasReplyReference: hadReplyReference,
    });
    throw new BadRequestException(`No se pudo resolver el hilo del mensaje entrante (${reason})`);
  }

  private logWebhookRoutingIssue(
    reason: string,
    payload: NormalizedInboundMessage,
    extra?: Record<string, unknown>,
  ): void {
    const metadata = {
      externalMessageId: payload.externalMessageId,
      contextToken: payload.contextToken?.trim() || payload.externalThreadKey?.trim() || null,
      from: payload.from ?? null,
      replyToExternalMessageId: payload.replyToExternalMessageId ?? null,
      serviceOrderId: payload.serviceOrderId ?? null,
      ...extra,
    };
    this.logger.warn(`service-order-inbox inbound rejected reason=${reason} metadata=${JSON.stringify(metadata)}`);
  }

  private async persistUploadedAttachments(
    message: ServiceOrderInboxMessage,
    files: UploadedFile[],
  ): Promise<StoredAttachmentPayload[]> {
    const stored: StoredAttachmentPayload[] = [];
    for (const file of files) {
      this.validateUploadedFile(file);
      const attachmentType = this.resolveAttachmentType(file.mimetype);
      const savedFile = await this.storeBinaryFile(message.threadId, file.originalname, attachmentType, file.buffer);
      const entity = await this.attachmentRepository.save(
        this.attachmentRepository.create({
          messageId: message.id,
          attachmentType,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          providerMediaId: null,
          providerUrl: null,
          cachedFilePath: savedFile.absolutePath,
          publicUrl: this.buildAttachmentDownloadPathPlaceholder(),
        }),
      );

      entity.publicUrl = this.buildAttachmentDownloadPath(entity.id);
      await this.attachmentRepository.save(entity);

      stored.push({
        entity,
        base64Data: file.buffer.toString('base64'),
      });
    }
    return stored;
  }

  private async persistUploadedAttachment(
    message: ServiceOrderInboxMessage,
    file: UploadedFile,
  ): Promise<StoredAttachmentPayload> {
    const stored = await this.persistUploadedAttachments(message, [file]);
    const attachment = stored[0];
    if (!attachment) {
      throw new NotFoundException('No se pudo persistir el adjunto');
    }
    return attachment;
  }

  private async persistInboundAttachments(
    message: ServiceOrderInboxMessage,
    attachments: ServiceOrderInboxWebhookAttachmentDto[],
  ): Promise<void> {
    for (const attachment of attachments) {
      const attachmentType = this.resolveInboundAttachmentType(attachment);
      const fileName = this.normalizeAttachmentFileName(attachment.fileName, attachmentType);
      let cachedFilePath: string | null = null;

      if (attachment.base64Data) {
        const buffer = Buffer.from(attachment.base64Data, 'base64');
        const stored = await this.storeBinaryFile(message.threadId, fileName, attachmentType, buffer);
        cachedFilePath = stored.absolutePath;
      }

      const saved = await this.attachmentRepository.save(
        this.attachmentRepository.create({
          messageId: message.id,
          attachmentType,
          fileName,
          mimeType: attachment.mimeType?.trim() || this.defaultMimeForType(attachmentType),
          sizeBytes: Number(attachment.sizeBytes || 0),
          providerMediaId: attachment.providerMediaId?.trim() || null,
          providerUrl: null,
          cachedFilePath,
          publicUrl: this.buildAttachmentDownloadPathPlaceholder(),
        }),
      );

      saved.publicUrl = this.buildAttachmentDownloadPath(saved.id);
      await this.attachmentRepository.save(saved);
    }
  }

  private async refreshThreadAfterMessage(
    thread: ThreadWithRelations,
    message: ServiceOrderInboxMessage,
    options: {
      incrementReceptionUnread?: boolean;
      incrementTechnicianUnread?: boolean;
      incrementSupervisorUnread?: boolean;
      resetReceptionUnread?: boolean;
      resetTechnicianUnread?: boolean;
      resetSupervisorUnread?: boolean;
      markCustomerActivity?: boolean;
    },
  ): Promise<void> {
    thread.lastMessageText = message.text?.trim() || this.describeAttachmentOnlyMessage(message);
    thread.lastMessageAt = message.createdAt;
    thread.lastMessageDirection = message.direction;
    thread.lastMessageAuthorRole = message.authorRole;
    if (options.markCustomerActivity && message.authorRole === ServiceOrderInboxAuthorRole.CLIENT) {
      thread.lastCustomerMessageAt = message.createdAt;
    }

    if (options.incrementReceptionUnread) {
      thread.unreadForReception += 1;
    }
    if (options.incrementTechnicianUnread) {
      thread.unreadForTechnician += 1;
    }
    if (options.incrementSupervisorUnread) {
      thread.unreadForSupervisor += 1;
    }
    if (options.resetReceptionUnread) {
      thread.unreadForReception = 0;
    }
    if (options.resetTechnicianUnread) {
      thread.unreadForTechnician = 0;
    }
    if (options.resetSupervisorUnread) {
      thread.unreadForSupervisor = 0;
    }

    await this.threadRepository.save(thread);
  }

  private async finalizeOutboundMessage(
    thread: ThreadWithRelations,
    message: ServiceOrderInboxMessage,
    dispatchResult: DispatchOutboundResult,
    threadUpdateOptions: {
      incrementReceptionUnread?: boolean;
      incrementTechnicianUnread?: boolean;
      incrementSupervisorUnread?: boolean;
      resetReceptionUnread?: boolean;
      resetTechnicianUnread?: boolean;
      resetSupervisorUnread?: boolean;
    },
  ): Promise<void> {
    message.deliveryStatus = this.normalizeDeliveryStatus(dispatchResult.status);
    message.externalMessageId = dispatchResult.externalMessageId ?? null;
    message.providerPayload = dispatchResult.providerPayload
      ? JSON.stringify(dispatchResult.providerPayload)
      : null;
    const savedMessage = await this.messageRepository.save(message);
    await this.refreshThreadAfterMessage(thread, savedMessage, threadUpdateOptions);
  }

  private describeAttachmentOnlyMessage(message: ServiceOrderInboxMessage): string {
    if (message.direction === ServiceOrderInboxDirection.INBOUND) {
      return '[Adjunto recibido]';
    }
    return '[Adjunto enviado]';
  }

  private async ensureThreadForOrder(serviceOrderId: number, viewer: InboxViewerContext): Promise<ThreadWithRelations> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id: serviceOrderId },
      relations: ['assignedTechnician', 'client'],
    });
    if (!serviceOrder) {
      throw new NotFoundException('Orden de servicio no encontrada');
    }

    await this.ensureServiceOrderAccess(serviceOrder, viewer, false);

    const normalizedPhone = this.normalizeComparablePhone(serviceOrder.clientSnapshotPhone ?? serviceOrder.client?.phone ?? null);
    const candidateThreads = normalizedPhone
      ? await this.threadRepository.find({
          where: { clientPhoneSnapshot: normalizedPhone },
          relations: ['orderLinks', 'orderLinks.serviceOrder', 'orderLinks.serviceOrder.assignedTechnician', 'orderLinks.serviceOrder.client'],
        })
      : [];
    const thread =
      candidateThreads.length > 0
        ? await this.consolidateThreads(candidateThreads as ThreadWithRelations[])
        : ((await this.threadRepository.save(
            this.threadRepository.create({
              clientId: serviceOrder.clientId ?? null,
              clientPhoneSnapshot: normalizedPhone,
              clientDisplayNameSnapshot: serviceOrder.clientSnapshotName ?? null,
              externalThreadKey: randomUUID(),
              lastMessageText: null,
              lastMessageAt: null,
              lastCustomerMessageAt: null,
              lastMessageDirection: null,
              lastMessageAuthorRole: null,
              unreadForReception: 0,
              unreadForTechnician: 0,
              unreadForSupervisor: 0,
            }),
          )) as ThreadWithRelations);

    await this.ensureThreadOrderLink(thread.id, serviceOrder.id);
    const reloaded = await this.loadThreadById(thread.id);
    await this.ensureThreadAccess(reloaded, viewer, false);
    return reloaded;
  }

  private async getThreadWithAccess(
    threadId: number,
    viewer: InboxViewerContext,
    requireWritableAccess = false,
  ): Promise<ThreadWithRelations> {
    const thread = await this.loadThreadById(threadId);
    if (!thread) {
      throw new NotFoundException('Hilo no encontrado');
    }

    await this.ensureThreadAccess(thread, viewer, requireWritableAccess);
    return thread;
  }

  private async ensureThreadAccess(
    thread: ThreadWithRelations,
    viewer: InboxViewerContext,
    requireWritableAccess: boolean,
  ): Promise<void> {
    const linkedOrders = this.getLinkedOrders(thread);
    if (!linkedOrders.length) {
      if (viewer.role === 'SUPERVISOR' || viewer.role === 'ADMIN' || viewer.role === 'RECEPTION') {
        return;
      }
      throw new ForbiddenException('No tienes acceso a este hilo');
    }

    if (viewer.role === 'SUPERVISOR' || viewer.role === 'ADMIN') {
      return;
    }

    const activeOrders = linkedOrders.filter((order) => this.isActiveOrder(order));
    if (!activeOrders.length) {
      throw new ForbiddenException('No tienes acceso a conversaciones de ordenes finalizadas');
    }

    if (viewer.role === 'RECEPTION') {
      return;
    }

    if (viewer.role === 'TECHNICIAN') {
      const hasVisibleOrder = activeOrders.some(
        (order) => !!viewer.userId && Number(order.assignedToTechnicianId) === Number(viewer.userId),
      );
      if (!hasVisibleOrder) {
        throw new ForbiddenException('No tienes acceso a este hilo');
      }
      return;
    }

    if (requireWritableAccess) {
      throw new ForbiddenException('No tienes acceso para enviar mensajes');
    }
  }

  private async ensureServiceOrderAccess(
    serviceOrder: ServiceOrder,
    viewer: InboxViewerContext,
    requireWritableAccess: boolean,
  ): Promise<void> {
    if (viewer.role === 'SUPERVISOR' || viewer.role === 'ADMIN') {
      return;
    }

    const isActive = this.isActiveOrder(serviceOrder);
    if (!isActive) {
      throw new ForbiddenException('No tienes acceso a conversaciones de ordenes finalizadas');
    }

    if (viewer.role === 'RECEPTION') {
      return;
    }

    if (viewer.role === 'TECHNICIAN') {
      if (!viewer.userId || Number(serviceOrder.assignedToTechnicianId) !== Number(viewer.userId)) {
        throw new ForbiddenException('No tienes acceso a este hilo');
      }
      return;
    }

    if (requireWritableAccess) {
      throw new ForbiddenException('No tienes acceso para enviar mensajes');
    }
  }

  private applyViewerScope(qb: any, viewer: InboxViewerContext): void {
    if (viewer.role === 'SUPERVISOR' || viewer.role === 'ADMIN') {
      return;
    }

    qb.andWhere('serviceOrder.operativeStatus NOT IN (:...terminalStatuses)', {
      terminalStatuses: TERMINAL_OPERATIVE_STATUSES,
    });

    if (viewer.role === 'TECHNICIAN') {
      if (!viewer.userId) {
        throw new UnauthorizedException('Usuario tecnico no identificado');
      }
      qb.andWhere('serviceOrder.assignedToTechnicianId = :technicianId', {
        technicianId: viewer.userId,
      });
    }
  }

  private async mapThreadSummary(
    thread: ServiceOrderInboxThread,
    viewer: InboxViewerContext,
    preloadedMessages?: Array<ServiceOrderInboxMessage & { orderLinks?: ServiceOrderInboxMessageOrderLink[] }>,
  ) {
    const linkedOrders = this.getReadableOrders(thread as ThreadWithRelations);
    const activeOrders = linkedOrders.filter((order) => this.isActiveOrder(order));
    const primaryOrder = this.resolvePrimaryOrderForSummary(thread as ThreadWithRelations, viewer);
    const lastMessageSummary = await this.resolveThreadLastMessageSummary(thread as ThreadWithRelations, viewer, preloadedMessages);
    return {
      id: thread.id,
      serviceOrderId: primaryOrder?.id ?? null,
      serviceOrderCode: primaryOrder?.code ?? null,
      serviceOrderIds: linkedOrders.map((order) => order.id),
      activeServiceOrderIds: activeOrders.map((order) => order.id),
      serviceOrderCodes: linkedOrders.map((order) => order.code),
      equipmentLabel: primaryOrder ? this.buildEquipmentLabel(primaryOrder) : 'Equipo',
      clientAlias: thread.clientDisplayNameSnapshot ?? primaryOrder?.clientSnapshotName ?? 'Cliente',
      assignedTechnicianAlias: primaryOrder?.assignedTechnician?.name ?? 'Sin tecnico',
      operativeStatus: primaryOrder?.operativeStatus ?? null,
      technicalStatus: primaryOrder?.technicalStatus ?? null,
      commercialStatus: primaryOrder?.commercialStatus ?? null,
      economicStatus: primaryOrder?.economicStatus ?? null,
      clientPhone:
        viewer.role === 'SUPERVISOR' || viewer.role === 'ADMIN'
          ? thread.clientPhoneSnapshot
          : null,
      lastMessageText: lastMessageSummary.lastMessageText,
      lastMessageAt: lastMessageSummary.lastMessageAt,
      lastCustomerMessageAt: lastMessageSummary.lastCustomerMessageAt,
      lastMessageDirection: lastMessageSummary.lastMessageDirection,
      lastMessageAuthorRole: lastMessageSummary.lastMessageAuthorRole,
      unreadCount: this.resolveUnreadCount(thread, viewer),
      contextToken: thread.externalThreadKey,
      orders: this.mapThreadOrders(thread as ThreadWithRelations, viewer),
    };
  }

  private mapMessage(
    message: ServiceOrderInboxMessage & {
      attachments?: ServiceOrderInboxAttachment[];
      orderLinks?: ServiceOrderInboxMessageOrderLink[];
    },
    viewer?: InboxViewerContext,
    thread?: ThreadWithRelations,
  ) {
    const visibleServiceOrderIds = this.getVisibleMessageOrderIds(message, thread, viewer);
    return {
      id: message.id,
      threadId: message.threadId,
      direction: message.direction,
      authorRole: message.authorRole,
      authorDisplayName: message.authorDisplayName,
      text: message.text,
      deliveryStatus: message.deliveryStatus,
      externalMessageId: message.externalMessageId,
      createdAt: message.createdAt.toISOString(),
      serviceOrderIds: visibleServiceOrderIds,
      attachments:
        message.attachments?.map((attachment) => ({
          id: attachment.id,
          attachmentType: attachment.attachmentType,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: Number(attachment.sizeBytes || 0),
          previewable: attachment.attachmentType === ServiceOrderInboxAttachmentType.IMAGE,
          downloadPath: this.buildAttachmentDownloadPath(attachment.id),
        })) ?? [],
    };
  }

  private resolveUnreadCount(thread: ServiceOrderInboxThread, viewer: InboxViewerContext): number {
    switch (viewer.role) {
      case 'SUPERVISOR':
      case 'ADMIN':
        return Number(thread.unreadForSupervisor || 0);
      case 'RECEPTION':
        return Number(thread.unreadForReception || 0);
      case 'TECHNICIAN':
        return Number(thread.unreadForTechnician || 0);
      default:
        return 0;
    }
  }

  private mapThreadOrders(thread: ThreadWithRelations, viewer: InboxViewerContext) {
    return this.getReadableOrders(thread).map((order) => ({
      id: order.id,
      code: order.code,
      equipmentLabel: this.buildEquipmentLabel(order),
      operativeStatus: order.operativeStatus,
      technicalStatus: order.technicalStatus,
      commercialStatus: order.commercialStatus,
      economicStatus: order.economicStatus,
      assignedTechnicianId: order.assignedToTechnicianId ?? null,
      assignedTechnicianAlias: order.assignedTechnician?.name ?? 'Sin tecnico',
      isActive: this.isActiveOrder(order),
    }));
  }

  private buildEquipmentLabel(serviceOrder?: ServiceOrder | null): string {
    if (!serviceOrder) {
      return 'Equipo';
    }

    const pieces = [
      serviceOrder.equipmentType === 'OTHER' ? serviceOrder.equipmentTypeOther : serviceOrder.equipmentType,
      serviceOrder.brand,
      serviceOrder.model,
    ]
      .map((piece) => String(piece ?? '').trim())
      .filter(Boolean);

    return pieces.join(' | ') || 'Equipo';
  }

  private resolveAuthorRole(viewerRole: ServiceOrderInboxViewerRole): ServiceOrderInboxAuthorRole {
    switch (viewerRole) {
      case 'TECHNICIAN':
        return ServiceOrderInboxAuthorRole.TECHNICIAN;
      case 'RECEPTION':
        return ServiceOrderInboxAuthorRole.RECEPTION;
      case 'SUPERVISOR':
      case 'ADMIN':
      default:
        return ServiceOrderInboxAuthorRole.SUPERVISOR;
    }
  }

  private isActiveOrder(serviceOrder: ServiceOrder | null | undefined): boolean {
    if (!serviceOrder) {
      return false;
    }

    return !TERMINAL_OPERATIVE_STATUSES.includes(serviceOrder.operativeStatus);
  }

  private normalizeComparablePhone(phone: string | null | undefined): string | null {
    return normalizeComparablePhoneValue(phone) ?? null;
  }

  private hasActiveOrders(thread: ThreadWithRelations): boolean {
    return this.getLinkedOrders(thread).some((order) => this.isActiveOrder(order));
  }

  private hasTechnicianVisibleActiveOrders(thread: ThreadWithRelations): boolean {
    return this.getLinkedOrders(thread).some(
      (order) => this.isActiveOrder(order) && !!order.assignedToTechnicianId,
    );
  }

  private getLinkedOrders(thread: ThreadWithRelations): ServiceOrder[] {
    return (thread.orderLinks ?? [])
      .map((link) => link.serviceOrder)
      .filter((order): order is ServiceOrder => !!order);
  }

  private getReadableOrders(thread: ThreadWithRelations): ServiceOrder[] {
    return this.getLinkedOrders(thread);
  }

  private getAssignableOrders(thread: ThreadWithRelations, viewer: InboxViewerContext): ServiceOrder[] {
    const linkedOrders = this.getLinkedOrders(thread);
    if (viewer.role !== 'TECHNICIAN') {
      return linkedOrders;
    }

    return linkedOrders.filter(
      (order) => this.isActiveOrder(order) && !!viewer.userId && Number(order.assignedToTechnicianId) === Number(viewer.userId),
    );
  }

  private resolvePrimaryOrderForSummary(thread: ThreadWithRelations, viewer: InboxViewerContext): ServiceOrder | null {
    const preferredOrders = this.getAssignableOrders(thread, viewer);
    const activePreferredOrder = preferredOrders.find((order) => this.isActiveOrder(order));
    if (activePreferredOrder) {
      return activePreferredOrder;
    }

    return preferredOrders[0] ?? this.getReadableOrders(thread)[0] ?? null;
  }

  private filterVisibleMessages(
    messages: Array<ServiceOrderInboxMessage & { attachments?: ServiceOrderInboxAttachment[]; orderLinks?: ServiceOrderInboxMessageOrderLink[] }>,
    thread: ThreadWithRelations,
    viewer: InboxViewerContext,
  ) {
    return messages;
  }

  private async resolveThreadLastMessageSummary(
    thread: ThreadWithRelations,
    viewer: InboxViewerContext,
    preloadedMessages?: Array<ServiceOrderInboxMessage & { orderLinks?: ServiceOrderInboxMessageOrderLink[] }>,
  ): Promise<{
    lastMessageText: string | null;
    lastMessageAt: string | null;
    lastCustomerMessageAt: string | null;
    lastMessageDirection: ServiceOrderInboxDirection | null;
    lastMessageAuthorRole: ServiceOrderInboxAuthorRole | null;
  }> {
    return {
      lastMessageText: thread.lastMessageText,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
      lastCustomerMessageAt: thread.lastCustomerMessageAt?.toISOString() ?? null,
      lastMessageDirection: thread.lastMessageDirection,
      lastMessageAuthorRole: thread.lastMessageAuthorRole,
    };
  }

  private resolveMessageSummaryText(message: Pick<ServiceOrderInboxMessage, 'text' | 'direction'>): string {
    return message.text?.trim() || this.describeAttachmentOnlyMessage(message as ServiceOrderInboxMessage);
  }

  private getVisibleMessageOrderIds(
    message: ServiceOrderInboxMessage & { orderLinks?: ServiceOrderInboxMessageOrderLink[] },
    thread?: ThreadWithRelations,
    viewer?: InboxViewerContext,
  ): number[] {
    const linkedIds = (message.orderLinks ?? []).map((link) => Number(link.serviceOrderId));
    if (!viewer || !thread || viewer.role !== 'TECHNICIAN') {
      return linkedIds;
    }

    return linkedIds;
  }

  private ensureMessageScopedAccess(
    message: ServiceOrderInboxMessage & { orderLinks?: ServiceOrderInboxMessageOrderLink[] },
    thread: ThreadWithRelations,
    viewer: InboxViewerContext,
    requireEditableAccess: boolean,
  ): void {
    if (viewer.role !== 'TECHNICIAN') {
      return;
    }

    if (!requireEditableAccess) {
      return;
    }

    const visibleOrderIds = new Set(this.getAssignableOrders(thread, viewer).map((order) => Number(order.id)));
    const linkedIds = (message.orderLinks ?? []).map((link) => Number(link.serviceOrderId));

    if (requireEditableAccess && !this.hasEditableMessageScope(linkedIds, visibleOrderIds)) {
      throw new ForbiddenException('No tienes acceso para editar este mensaje');
    }
  }

  private hasVisibleMessageScope(
    message: { orderLinks?: ServiceOrderInboxMessageOrderLink[] },
    visibleOrderIds: Set<number>,
  ): boolean {
    const linkedIds = (message.orderLinks ?? []).map((link) => Number(link.serviceOrderId));
    return linkedIds.length > 0 && linkedIds.some((id) => visibleOrderIds.has(id));
  }

  private hasEditableMessageScope(linkedIds: number[], visibleOrderIds: Set<number>): boolean {
    return linkedIds.length > 0 && linkedIds.every((id) => visibleOrderIds.has(id));
  }

  private async resolveInboundServiceOrderIds(
    thread: ThreadWithRelations,
    payload: NormalizedInboundMessage,
  ): Promise<number[]> {
    if (payload.serviceOrderId) {
      await this.ensureThreadOrderLink(thread.id, payload.serviceOrderId);
      return [payload.serviceOrderId];
    }

    const replyToExternalMessageId = payload.replyToExternalMessageId?.trim() || null;
    if (replyToExternalMessageId) {
      const referencedMessage = await this.messageRepository.findOne({
        where: { externalMessageId: replyToExternalMessageId },
        relations: ['orderLinks'],
      });
      const linkedIds = (referencedMessage?.orderLinks ?? []).map((link) => Number(link.serviceOrderId));
      if (linkedIds.length) {
        return [...new Set(linkedIds)];
      }
    }

    const activeOrderIds = this.getLinkedOrders(thread)
      .filter((order) => this.isActiveOrder(order))
      .map((order) => Number(order.id));

    if (activeOrderIds.length === 1) {
      return activeOrderIds;
    }

    return [];
  }

  private async createInboundThreadFromPhone(
    payload: NormalizedInboundMessage,
    normalizedPhone: string,
  ): Promise<ThreadWithRelations> {
    return (await this.threadRepository.save(
      this.threadRepository.create({
        clientId: null,
        clientPhoneSnapshot: normalizedPhone,
        clientDisplayNameSnapshot: payload.senderName?.trim() || null,
        externalThreadKey: randomUUID(),
        lastMessageText: null,
        lastMessageAt: null,
        lastCustomerMessageAt: null,
        lastMessageDirection: null,
        lastMessageAuthorRole: null,
        unreadForReception: 0,
        unreadForTechnician: 0,
        unreadForSupervisor: 0,
      }),
    )) as ThreadWithRelations;
  }

  private async consolidateThreads(threads: ThreadWithRelations[]): Promise<ThreadWithRelations> {
    if (!threads.length) {
      throw new NotFoundException('No se encontró hilo para consolidar');
    }
    if (threads.length === 1) {
      return this.loadThreadById(threads[0].id);
    }

    const canonical = [...threads].sort((left, right) => {
      const leftTime = left.lastMessageAt?.getTime() ?? left.createdAt.getTime();
      const rightTime = right.lastMessageAt?.getTime() ?? right.createdAt.getTime();
      return rightTime - leftTime;
    })[0];
    const duplicates = threads.filter((thread) => thread.id !== canonical.id);

    for (const duplicate of duplicates) {
      await this.messageRepository.update({ threadId: duplicate.id }, { threadId: canonical.id });

      const duplicateOrderLinks = (await this.threadOrderLinkRepository.find({
        where: { threadId: duplicate.id },
      })) ?? [];
      for (const link of duplicateOrderLinks) {
        await this.ensureThreadOrderLink(canonical.id, link.serviceOrderId);
      }
      if (duplicateOrderLinks.length) {
        await this.threadOrderLinkRepository.remove(duplicateOrderLinks);
      }

      await this.threadRepository.delete({ id: duplicate.id });
    }

    const reloaded = await this.loadThreadById(canonical.id);
    reloaded.lastMessageAt = [canonical.lastMessageAt, ...duplicates.map((thread) => thread.lastMessageAt)]
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? reloaded.lastMessageAt;
    reloaded.lastCustomerMessageAt = [canonical.lastCustomerMessageAt, ...duplicates.map((thread) => thread.lastCustomerMessageAt)]
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? reloaded.lastCustomerMessageAt;
    reloaded.clientDisplayNameSnapshot =
      reloaded.clientDisplayNameSnapshot ??
      canonical.clientDisplayNameSnapshot ??
      duplicates.map((thread) => thread.clientDisplayNameSnapshot).find(Boolean) ??
      null;
    await this.threadRepository.save(reloaded);
    return this.loadThreadById(canonical.id);
  }

  private async findThreadByServiceOrderId(serviceOrderId: number): Promise<ThreadWithRelations | null> {
    const link = await this.threadOrderLinkRepository.findOne({
      where: { serviceOrderId },
    });
    if (!link) {
      return null;
    }

    return this.loadThreadById(link.threadId);
  }

  private async loadThreadById(threadId: number): Promise<ThreadWithRelations> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: [
        'orderLinks',
        'orderLinks.serviceOrder',
        'orderLinks.serviceOrder.assignedTechnician',
        'orderLinks.serviceOrder.client',
      ],
    });
    if (!thread) {
      throw new NotFoundException('Hilo no encontrado');
    }
    return thread as ThreadWithRelations;
  }

  private async ensureThreadOrderLink(threadId: number, serviceOrderId: number): Promise<void> {
    const existing = await this.threadOrderLinkRepository.findOne({
      where: { threadId, serviceOrderId },
    });
    if (existing) {
      return;
    }

    await this.threadOrderLinkRepository.save(
      this.threadOrderLinkRepository.create({
        threadId,
        serviceOrderId,
      }),
    );
  }

  private async associateMessageWithOrders(messageId: number, serviceOrderIds: number[]): Promise<void> {
    const normalizedIds = [...new Set((serviceOrderIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!normalizedIds.length) {
      return;
    }

    await this.messageOrderLinkRepository.save(
      normalizedIds.map((serviceOrderId) =>
        this.messageOrderLinkRepository.create({
          messageId,
          serviceOrderId,
        }),
      ),
    );
  }

  private resolveRequestedServiceOrderIds(
    thread: ThreadWithRelations,
    rawIds: number[] | undefined,
    viewer: InboxViewerContext,
  ): number[] {
    const normalizedIds = [...new Set((rawIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!normalizedIds.length) {
      return [];
    }

    const threadOrderIds = new Set(this.getLinkedOrders(thread).map((order) => Number(order.id)));
    const invalidIds = normalizedIds.filter((id) => !threadOrderIds.has(id));
    if (invalidIds.length) {
      throw new BadRequestException('Una o más órdenes no pertenecen al hilo');
    }

    if (viewer.role === 'TECHNICIAN') {
      const visibleOrderIds = new Set(this.getAssignableOrders(thread, viewer).map((order) => Number(order.id)));
      const unauthorizedIds = normalizedIds.filter((id) => !visibleOrderIds.has(id));
      if (unauthorizedIds.length) {
        throw new ForbiddenException('No tienes acceso a una o más órdenes de este hilo');
      }
    }

    return normalizedIds;
  }

  private resolveDefaultMessageServiceOrderIds(thread: ThreadWithRelations, viewer: InboxViewerContext): number[] {
    if (viewer.role !== 'TECHNICIAN') {
      return [];
    }

    const primaryVisibleOrderId = this.resolvePrimaryServiceOrderId(thread, viewer);
    return primaryVisibleOrderId ? [primaryVisibleOrderId] : [];
  }

  private resolvePrimaryServiceOrderId(thread: ThreadWithRelations, viewer?: InboxViewerContext): number | null {
    const sourceOrders = viewer ? this.getAssignableOrders(thread, viewer) : this.getLinkedOrders(thread);
    const active = sourceOrders.find((order) => this.isActiveOrder(order));
    return active?.id ?? sourceOrders[0]?.id ?? null;
  }

  private normalizePositiveNumber(value: number | undefined, fallback: number, max: number): number {
    const numeric = Number(value || fallback);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return fallback;
    }
    return Math.min(max, Math.floor(numeric));
  }

  private validateUploadedFile(file: UploadedFile): void {
    if (!file) {
      throw new BadRequestException('Adjunto invalido');
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException(`El archivo ${file.originalname} excede el tamano maximo permitido`);
    }
    this.resolveAttachmentType(file.mimetype);
  }

  private resolveAttachmentType(mimeType?: string | null): ServiceOrderInboxAttachmentType {
    const normalized = String(mimeType ?? '').trim().toLowerCase();
    if (normalized.startsWith('image/')) {
      return ServiceOrderInboxAttachmentType.IMAGE;
    }
    if (normalized === 'application/pdf') {
      return ServiceOrderInboxAttachmentType.PDF;
    }
    if (normalized.startsWith('audio/')) {
      return ServiceOrderInboxAttachmentType.AUDIO;
    }
    if (ALLOWED_DOCUMENT_MIME_TYPES.has(normalized)) {
      return ServiceOrderInboxAttachmentType.DOCUMENT;
    }
    throw new BadRequestException(`Tipo de archivo no permitido: ${mimeType ?? 'desconocido'}`);
  }

  private resolveInboundAttachmentType(
    attachment: ServiceOrderInboxWebhookAttachmentDto,
  ): ServiceOrderInboxAttachmentType {
    if (attachment.type) {
      const normalizedType = String(attachment.type).trim().toLowerCase();
      if (Object.values(ServiceOrderInboxAttachmentType).includes(normalizedType as ServiceOrderInboxAttachmentType)) {
        return normalizedType as ServiceOrderInboxAttachmentType;
      }
    }
    return this.resolveAttachmentType(attachment.mimeType);
  }

  private normalizeAttachmentFileName(
    fileName: string | undefined,
    attachmentType: ServiceOrderInboxAttachmentType,
  ): string {
    const raw = basename(String(fileName ?? '').trim()) || `adjunto-${attachmentType}`;
    const sanitized = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
    const extension = extname(sanitized);
    if (extension) {
      return sanitized;
    }
    switch (attachmentType) {
      case ServiceOrderInboxAttachmentType.IMAGE:
        return `${sanitized}.jpg`;
      case ServiceOrderInboxAttachmentType.PDF:
        return `${sanitized}.pdf`;
      case ServiceOrderInboxAttachmentType.AUDIO:
        return `${sanitized}.mp3`;
      default:
        return `${sanitized}.bin`;
    }
  }

  private async storeBinaryFile(
    threadId: number,
    fileName: string,
    attachmentType: ServiceOrderInboxAttachmentType,
    buffer: Buffer,
  ) {
    const safeName = this.normalizeAttachmentFileName(fileName, attachmentType);
    return this.privateFileStorage.store('service-order-inbox', [String(threadId)], safeName, buffer);
  }

  private buildAttachmentDownloadPath(id: number): string {
    return `/service-orders/inbox/attachments/${id}/download`;
  }

  private buildAttachmentDownloadPathPlaceholder(): string {
    return '/service-orders/inbox/attachments/pending/download';
  }

  private defaultMimeForType(type: ServiceOrderInboxAttachmentType): string {
    switch (type) {
      case ServiceOrderInboxAttachmentType.IMAGE:
        return 'image/jpeg';
      case ServiceOrderInboxAttachmentType.PDF:
        return 'application/pdf';
      case ServiceOrderInboxAttachmentType.AUDIO:
        return 'audio/mpeg';
      default:
        return 'application/octet-stream';
    }
  }

  private normalizeDeliveryStatus(value?: string | null): ServiceOrderInboxDeliveryStatus {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (Object.values(ServiceOrderInboxDeliveryStatus).includes(normalized as ServiceOrderInboxDeliveryStatus)) {
      return normalized as ServiceOrderInboxDeliveryStatus;
    }
    if (normalized === 'SUCCESS') {
      return ServiceOrderInboxDeliveryStatus.SENT;
    }
    if (normalized === 'ERROR') {
      return ServiceOrderInboxDeliveryStatus.FAILED;
    }
    return ServiceOrderInboxDeliveryStatus.QUEUED;
  }
}
