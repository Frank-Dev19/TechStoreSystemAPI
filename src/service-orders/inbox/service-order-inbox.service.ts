import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderOperativeStatus } from '../enums';
import {
  RECEPTIONIST_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  TECHNICIAN_ROLE_NAMES,
  hasRoleName,
} from '../../common/constants/role-names';
import { ServiceOrderInboxThread } from './entities/service-order-inbox-thread.entity';
import { ServiceOrderInboxMessage } from './entities/service-order-inbox-message.entity';
import { ServiceOrderInboxAttachment } from './entities/service-order-inbox-attachment.entity';
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

type InboxViewerContext = {
  userId: number | null;
  displayName: string | null;
  role: ServiceOrderInboxViewerRole;
};

type StoredAttachmentPayload = {
  entity: ServiceOrderInboxAttachment;
  base64Data?: string | null;
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
  constructor(
    @InjectRepository(ServiceOrderInboxThread)
    private readonly threadRepository: Repository<ServiceOrderInboxThread>,
    @InjectRepository(ServiceOrderInboxMessage)
    private readonly messageRepository: Repository<ServiceOrderInboxMessage>,
    @InjectRepository(ServiceOrderInboxAttachment)
    private readonly attachmentRepository: Repository<ServiceOrderInboxAttachment>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    private readonly channelService: ServiceOrderInboxChannelService,
  ) {}

  buildViewerContext(user: any): InboxViewerContext {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const userId = Number(user?.sub ?? user?.id ?? 0) || null;
    const displayName = typeof user?.name === 'string' ? user.name : null;

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

  async listThreads(query: ServiceOrderInboxQueryDto, viewer: InboxViewerContext) {
    const page = this.normalizePositiveNumber(query.page, 1, MAX_PAGE_SIZE);
    const limit = this.normalizePositiveNumber(query.limit, 20, MAX_PAGE_SIZE);
    const serviceOrderId = query.serviceOrderId ? Number(query.serviceOrderId) : null;

    if (serviceOrderId && query.ensure) {
      await this.ensureThreadForOrder(serviceOrderId, viewer);
    }

    const qb = this.threadRepository
      .createQueryBuilder('thread')
      .innerJoinAndSelect('thread.serviceOrder', 'serviceOrder')
      .leftJoinAndSelect('serviceOrder.assignedTechnician', 'assignedTechnician')
      .leftJoinAndSelect('serviceOrder.client', 'client');

    this.applyViewerScope(qb, viewer);

    if (serviceOrderId) {
      qb.andWhere('thread.serviceOrderId = :serviceOrderId', { serviceOrderId });
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
            .orWhere('LOWER(serviceOrder.model) LIKE :search');
        }),
        { search: `%${search}%` },
      );
    }

    qb.orderBy('COALESCE(thread.lastMessageAt, thread.createdAt)', 'DESC')
      .addOrderBy('thread.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [threads, total] = await qb.getManyAndCount();

    return {
      data: threads.map((thread) => this.mapThreadSummary(thread, viewer)),
      total,
      page,
      limit,
    };
  }

  async getMessages(threadId: number, viewer: InboxViewerContext) {
    const thread = await this.getThreadWithAccess(threadId, viewer);
    const messages = await this.messageRepository.find({
      where: { threadId: thread.id },
      relations: ['attachments'],
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      thread: this.mapThreadSummary(thread, viewer),
      messages: messages.map((message) => this.mapMessage(message)),
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

    const dispatchPayload = {
      threadId: thread.id,
      serviceOrderId: thread.serviceOrderId,
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
          relations: ['attachments'],
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
      relations: ['attachments'],
    });
    if (dedupe) {
      return this.mapMessage(dedupe);
    }

    const thread = await this.resolveInboundThread(payload);
    const normalizedText = payload.text?.trim() || null;
    const attachments = payload.attachments ?? [];
    if (!normalizedText && !attachments.length) {
      throw new BadRequestException('El webhook no contiene texto ni adjuntos');
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

    await this.persistInboundAttachments(message, attachments);
    await this.refreshThreadAfterMessage(thread, message, {
      incrementReceptionUnread: this.isActiveOrder(thread.serviceOrder),
      incrementTechnicianUnread: this.isActiveOrder(thread.serviceOrder),
      incrementSupervisorUnread: true,
    });

    const reloaded = await this.messageRepository.findOne({
      where: { id: message.id },
      relations: ['attachments'],
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
      throw new NotFoundException('Mensaje no encontrado');
    }

    message.deliveryStatus = this.normalizeDeliveryStatus(payload.status);
    message.providerPayload = payload.rawPayload ? JSON.stringify(payload.rawPayload) : message.providerPayload;
    await this.messageRepository.save(message);
    return { ok: true };
  }

  async hasThreadActivity(serviceOrderId: number): Promise<boolean> {
    const thread = await this.threadRepository.findOne({
      where: { serviceOrderId },
      select: {
        id: true,
        serviceOrderId: true,
        lastMessageAt: true,
      },
    });

    return !!thread?.lastMessageAt;
  }

  async sendSystemMessageForOrder(serviceOrderId: number, text: string) {
    const normalizedText = text.trim();
    if (!normalizedText) {
      throw new BadRequestException('El mensaje automatico no puede estar vacio');
    }

    const systemViewer: InboxViewerContext = {
      role: 'SUPERVISOR',
      userId: null,
      displayName: 'Sistema',
    };
    const thread = await this.ensureThreadForOrder(serviceOrderId, systemViewer);
    const message = await this.messageRepository.save(
      this.messageRepository.create({
        threadId: thread.id,
        direction: ServiceOrderInboxDirection.OUTBOUND,
        authorRole: ServiceOrderInboxAuthorRole.SYSTEM,
        authorUserId: null,
        authorDisplayName: 'Sistema',
        text: normalizedText,
        deliveryStatus: ServiceOrderInboxDeliveryStatus.QUEUED,
      }),
    );

    if (!thread.clientPhoneSnapshot) {
      const dispatchResult = {
        status: ServiceOrderInboxDeliveryStatus.SKIPPED,
        providerPayload: { reason: 'missing-client-phone' },
      };
      await this.finalizeOutboundMessage(thread, message, dispatchResult, {
        incrementReceptionUnread: this.isActiveOrder(thread.serviceOrder),
        incrementTechnicianUnread:
          this.isActiveOrder(thread.serviceOrder) && !!thread.serviceOrder.assignedToTechnicianId,
        incrementSupervisorUnread: true,
      });

      return this.mapMessage(
        (await this.messageRepository.findOne({
          where: { id: message.id },
          relations: ['attachments'],
        })) ?? message,
      );
    }

    try {
      const dispatchResult = await this.channelService.dispatchTextMessage({
        threadId: thread.id,
        serviceOrderId: thread.serviceOrderId,
        contextToken: thread.externalThreadKey,
        clientPhone: thread.clientPhoneSnapshot,
        text: normalizedText,
        authorRole: ServiceOrderInboxAuthorRole.SYSTEM,
        authorDisplayName: 'Sistema',
        attachments: [],
      });

      await this.finalizeOutboundMessage(thread, message, dispatchResult, {
        incrementReceptionUnread: this.isActiveOrder(thread.serviceOrder),
        incrementTechnicianUnread:
          this.isActiveOrder(thread.serviceOrder) && !!thread.serviceOrder.assignedToTechnicianId,
        incrementSupervisorUnread: true,
      });
    } catch (error) {
      await this.finalizeOutboundMessage(
        thread,
        message,
        {
          status: ServiceOrderInboxDeliveryStatus.FAILED,
          providerPayload: {
            error: error instanceof Error ? error.message : 'dispatch-failed',
          },
        },
        {
          incrementReceptionUnread: this.isActiveOrder(thread.serviceOrder),
          incrementTechnicianUnread:
            this.isActiveOrder(thread.serviceOrder) && !!thread.serviceOrder.assignedToTechnicianId,
          incrementSupervisorUnread: true,
        },
      );
      throw error;
    }

    const savedMessage = await this.messageRepository.findOne({
      where: { id: message.id },
      relations: ['attachments'],
    });

    if (!savedMessage) {
      throw new NotFoundException('No se pudo recuperar el mensaje automatico');
    }

    return this.mapMessage(savedMessage);
  }

  async downloadAttachment(attachmentId: number, viewer: InboxViewerContext) {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId },
      relations: ['message', 'message.thread', 'message.thread.serviceOrder', 'message.thread.serviceOrder.assignedTechnician'],
    });

    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado');
    }

    await this.ensureThreadAccess(attachment.message.thread, viewer, false);

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
    if (contextToken) {
      const existing = await this.threadRepository.findOne({
        where: { externalThreadKey: contextToken },
        relations: ['serviceOrder', 'serviceOrder.assignedTechnician'],
      });
      if (existing) {
        return existing;
      }
    }

    const replyToExternalMessageId = payload.replyToExternalMessageId?.trim() || null;
    if (replyToExternalMessageId) {
      const referencedMessage = await this.messageRepository.findOne({
        where: { externalMessageId: replyToExternalMessageId },
        relations: ['thread', 'thread.serviceOrder', 'thread.serviceOrder.assignedTechnician'],
      });
      if (referencedMessage?.thread) {
        return referencedMessage.thread;
      }
    }

    const normalizedPhone = this.normalizeComparablePhone(payload.from);
    if (normalizedPhone) {
      const phoneMatches = await this.threadRepository.find({
        where: { clientPhoneSnapshot: normalizedPhone },
        relations: ['serviceOrder', 'serviceOrder.assignedTechnician'],
      });

      const activePhoneMatches = phoneMatches.filter((thread) => this.isActiveOrder(thread.serviceOrder));
      if (activePhoneMatches.length === 1) {
        return activePhoneMatches[0];
      }
      if (activePhoneMatches.length > 1) {
        throw new BadRequestException('No se pudo resolver el hilo entrante de forma univoca');
      }
    }

    if (!payload.serviceOrderId) {
      throw new BadRequestException('No se pudo resolver el hilo del mensaje entrante');
    }

    return this.ensureThreadForOrder(payload.serviceOrderId, { role: 'SUPERVISOR', userId: null, displayName: null });
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
    thread: ServiceOrderInboxThread,
    message: ServiceOrderInboxMessage,
    options: {
      incrementReceptionUnread?: boolean;
      incrementTechnicianUnread?: boolean;
      incrementSupervisorUnread?: boolean;
      resetReceptionUnread?: boolean;
      resetTechnicianUnread?: boolean;
      resetSupervisorUnread?: boolean;
    },
  ): Promise<void> {
    thread.lastMessageText = message.text?.trim() || this.describeAttachmentOnlyMessage(message);
    thread.lastMessageAt = message.createdAt;
    thread.lastMessageDirection = message.direction;
    thread.lastMessageAuthorRole = message.authorRole;

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
    thread: ServiceOrderInboxThread,
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

  private async ensureThreadForOrder(serviceOrderId: number, viewer: InboxViewerContext) {
    const existing = await this.threadRepository.findOne({
      where: { serviceOrderId },
      relations: ['serviceOrder', 'serviceOrder.assignedTechnician', 'serviceOrder.client'],
    });
    if (existing) {
      await this.ensureThreadAccess(existing, viewer, false);
      return existing;
    }

    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id: serviceOrderId },
      relations: ['assignedTechnician', 'client'],
    });
    if (!serviceOrder) {
      throw new NotFoundException('Orden de servicio no encontrada');
    }

    await this.ensureServiceOrderAccess(serviceOrder, viewer, false);

    const createdThread = await this.threadRepository.save(
      this.threadRepository.create({
        serviceOrderId: serviceOrder.id,
        clientPhoneSnapshot: this.normalizeComparablePhone(serviceOrder.clientSnapshotPhone ?? serviceOrder.client?.phone ?? null),
        externalThreadKey: randomUUID(),
        lastMessageText: null,
        lastMessageAt: null,
        lastMessageDirection: null,
        lastMessageAuthorRole: null,
        unreadForReception: 0,
        unreadForTechnician: 0,
        unreadForSupervisor: 0,
      }),
    );

    createdThread.serviceOrder = serviceOrder;
    return createdThread;
  }

  private async getThreadWithAccess(
    threadId: number,
    viewer: InboxViewerContext,
    requireWritableAccess = false,
  ) {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId },
      relations: ['serviceOrder', 'serviceOrder.assignedTechnician', 'serviceOrder.client'],
    });
    if (!thread) {
      throw new NotFoundException('Hilo no encontrado');
    }

    await this.ensureThreadAccess(thread, viewer, requireWritableAccess);
    return thread;
  }

  private async ensureThreadAccess(
    thread: ServiceOrderInboxThread,
    viewer: InboxViewerContext,
    requireWritableAccess: boolean,
  ): Promise<void> {
    await this.ensureServiceOrderAccess(thread.serviceOrder, viewer, requireWritableAccess);
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

  private mapThreadSummary(thread: ServiceOrderInboxThread, viewer: InboxViewerContext) {
    return {
      id: thread.id,
      serviceOrderId: thread.serviceOrderId,
      serviceOrderCode: thread.serviceOrder?.code ?? `SO-${thread.serviceOrderId}`,
      equipmentLabel: this.buildEquipmentLabel(thread.serviceOrder),
      clientAlias: thread.serviceOrder?.clientSnapshotName ?? 'Cliente',
      assignedTechnicianAlias: thread.serviceOrder?.assignedTechnician?.name ?? 'Sin tecnico',
      operativeStatus: thread.serviceOrder?.operativeStatus ?? null,
      technicalStatus: thread.serviceOrder?.technicalStatus ?? null,
      commercialStatus: thread.serviceOrder?.commercialStatus ?? null,
      economicStatus: thread.serviceOrder?.economicStatus ?? null,
      clientPhone: thread.clientPhoneSnapshot,
      lastMessageText: thread.lastMessageText,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
      lastMessageDirection: thread.lastMessageDirection,
      lastMessageAuthorRole: thread.lastMessageAuthorRole,
      unreadCount: this.resolveUnreadCount(thread, viewer),
      contextToken: thread.externalThreadKey,
    };
  }

  private mapMessage(message: ServiceOrderInboxMessage & { attachments?: ServiceOrderInboxAttachment[] }) {
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
    const normalized = String(phone ?? '')
      .replace(/\D+/g, '')
      .trim();
    return normalized || null;
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
    const folder = join(process.cwd(), 'storage', 'service-order-inbox', String(threadId));
    await fs.mkdir(folder, { recursive: true });
    const safeName = this.normalizeAttachmentFileName(fileName, attachmentType);
    const absolutePath = join(folder, `${randomUUID()}-${safeName}`);
    await fs.writeFile(absolutePath, buffer);
    return { absolutePath };
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
