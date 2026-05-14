import { ServiceOrderInboxService } from './service-order-inbox.service';
import { ServiceOrderInboxChannelService } from './service-order-inbox-channel.service';
import { ServiceOrderInboxAttachment } from './entities/service-order-inbox-attachment.entity';
import { ServiceOrderInboxMessage } from './entities/service-order-inbox-message.entity';
import { ServiceOrderInboxThread } from './entities/service-order-inbox-thread.entity';
import { ServiceOrderInboxAuthorRole, ServiceOrderInboxDeliveryStatus, ServiceOrderInboxDirection } from './service-order-inbox.types';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  find: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('ServiceOrderInboxService', () => {
  let service: ServiceOrderInboxService;
  let threadRepository: MockRepo<ServiceOrderInboxThread>;
  let messageRepository: MockRepo<ServiceOrderInboxMessage>;
  let attachmentRepository: MockRepo<ServiceOrderInboxAttachment>;
  let serviceOrderRepository: MockRepo;
  let channelService: jest.Mocked<ServiceOrderInboxChannelService>;
  let messageIdSequence: number;

  beforeEach(() => {
    threadRepository = createMockRepo<ServiceOrderInboxThread>();
    messageRepository = createMockRepo<ServiceOrderInboxMessage>();
    attachmentRepository = createMockRepo<ServiceOrderInboxAttachment>();
    serviceOrderRepository = createMockRepo();
    messageIdSequence = 1;

    channelService = {
      dispatchTextMessage: jest.fn(),
      dispatchAttachmentMessage: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;

    messageRepository.save.mockImplementation(async (value) => ({
      createdAt: new Date('2026-04-05T12:00:00.000Z'),
      updatedAt: new Date('2026-04-05T12:00:00.000Z'),
      ...value,
      id: value.id ?? messageIdSequence++,
    }));
    threadRepository.save.mockImplementation(async (value) => value);
    attachmentRepository.save.mockImplementation(async (value) => ({ id: value.id ?? 501, ...value }));

    service = new ServiceOrderInboxService(
      threadRepository as any,
      messageRepository as any,
      attachmentRepository as any,
      serviceOrderRepository as any,
      channelService,
    );
  });

  it('devuelve exito con partialFailures cuando el texto sale pero un adjunto falla', async () => {
    const thread = createThread();
    const reloadedMessage = createMessage({
      id: 1,
      threadId: thread.id,
      text: 'hola cliente',
      deliveryStatus: ServiceOrderInboxDeliveryStatus.SENT,
      externalMessageId: 'wamid-text-1',
      attachments: [],
    });

    jest.spyOn(service as any, 'getThreadWithAccess').mockResolvedValue(thread);
    jest.spyOn(service as any, 'persistUploadedAttachment').mockResolvedValue({
      entity: {
        id: 501,
        messageId: 2,
        attachmentType: 'image',
        fileName: 'foto.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12,
        providerMediaId: null,
        providerUrl: null,
        cachedFilePath: null,
        publicUrl: null,
      },
      base64Data: 'ZmFrZQ==',
    });
    messageRepository.findOne.mockResolvedValue(reloadedMessage as any);

    channelService.dispatchTextMessage.mockResolvedValue({
      status: ServiceOrderInboxDeliveryStatus.SENT,
      externalMessageId: 'wamid-text-1',
    });
    channelService.dispatchAttachmentMessage.mockRejectedValue(new Error('meta-attachment-failed'));

    const result = await service.sendMessage(
      thread.id,
      { text: 'hola cliente' },
      [createUploadedFile()],
      { role: 'RECEPTION', userId: 22, displayName: 'Recepcion' },
    );

    expect(result.id).toBe(1);
    expect(result.partialFailures).toEqual([
      expect.objectContaining({
        stage: 'attachment',
        attachmentId: 501,
        fileName: 'foto.jpg',
        error: 'meta-attachment-failed',
      }),
    ]);
  });

  it('mantiene error cuando ninguna entrega logra salir al canal', async () => {
    const thread = createThread();

    jest.spyOn(service as any, 'getThreadWithAccess').mockResolvedValue(thread);
    channelService.dispatchTextMessage.mockRejectedValue(new Error('meta-text-failed'));

    await expect(
      service.sendMessage(
        thread.id,
        { text: 'hola cliente' },
        [],
        { role: 'RECEPTION', userId: 22, displayName: 'Recepcion' },
      ),
    ).rejects.toThrow('meta-text-failed');
  });

  it('ordena threads sin usar expresiones que TypeORM no puede resolver como alias', async () => {
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    threadRepository.createQueryBuilder.mockReturnValue(qb as any);

    const result = await service.listThreads(
      { page: 1, limit: 6 },
      { role: 'ADMIN', userId: 1, displayName: 'Administrador' },
    );

    expect(qb.orderBy).toHaveBeenCalledWith('thread.lastMessageAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('thread.createdAt', 'DESC');
    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 6,
    });
  });

  it('procesa inbound con contextToken real y crea mensaje RECEIVED', async () => {
    const thread = createThread({ externalThreadKey: 'ctx-real' });
    const createdMessage = createMessage({
      id: 91,
      threadId: thread.id,
      direction: ServiceOrderInboxDirection.INBOUND,
      authorRole: ServiceOrderInboxAuthorRole.CLIENT,
      authorDisplayName: 'Cliente Demo',
      text: 'hola desde whatsapp',
      deliveryStatus: ServiceOrderInboxDeliveryStatus.RECEIVED,
      externalMessageId: 'wamid-inbound-1',
    });

    messageRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdMessage as any);
    threadRepository.findOne.mockResolvedValue(thread as any);

    const result = await service.receiveInboundMessage({
      externalMessageId: 'wamid-inbound-1',
      contextToken: 'ctx-real',
      from: '+51999111222',
      senderName: 'Cliente Demo',
      text: 'hola desde whatsapp',
      attachments: [],
    });

    expect(result.deliveryStatus).toBe(ServiceOrderInboxDeliveryStatus.RECEIVED);
    expect(result.direction).toBe(ServiceOrderInboxDirection.INBOUND);
    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread.id,
        direction: ServiceOrderInboxDirection.INBOUND,
        authorRole: ServiceOrderInboxAuthorRole.CLIENT,
        text: 'hola desde whatsapp',
        deliveryStatus: ServiceOrderInboxDeliveryStatus.RECEIVED,
        externalMessageId: 'wamid-inbound-1',
      }),
    );
  });

  it('resuelve inbound por replyToExternalMessageId cuando no llega contextToken', async () => {
    const thread = createThread();
    const createdMessage = createMessage({
      id: 92,
      threadId: thread.id,
      direction: ServiceOrderInboxDirection.INBOUND,
      authorRole: ServiceOrderInboxAuthorRole.CLIENT,
      text: 'respuesta del cliente',
      deliveryStatus: ServiceOrderInboxDeliveryStatus.RECEIVED,
      externalMessageId: 'wamid-inbound-2',
    });

    messageRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        thread,
      } as any)
      .mockResolvedValueOnce(createdMessage as any);

    const result = await service.receiveInboundMessage({
      externalMessageId: 'wamid-inbound-2',
      replyToExternalMessageId: 'wamid-outbound-1',
      from: '+51999111222',
      text: 'respuesta del cliente',
      attachments: [],
    });

    expect(result.id).toBe(92);
    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread.id,
        externalMessageId: 'wamid-inbound-2',
      }),
    );
  });

  it('rechaza inbound con teléfono ambiguo indicando ambiguous-phone', async () => {
    threadRepository.find.mockResolvedValue([
      createThread({ id: 11, clientPhoneSnapshot: '51999111222' }),
      createThread({ id: 12, clientPhoneSnapshot: '51999111222' }),
    ] as any);

    await expect(
      service.receiveInboundMessage({
        externalMessageId: 'wamid-inbound-3',
        from: '+51999111222',
        text: 'hola',
        attachments: [],
      }),
    ).rejects.toThrow('ambiguous-phone');
  });

  it('rechaza sample sin routeable data indicando missing-routing-data', async () => {
    await expect(
      service.receiveInboundMessage({
        externalMessageId: 'ABGGFlA5Fpa',
        from: '16315551181',
        text: 'this is a text message',
        attachments: [],
      }),
    ).rejects.toThrow('missing-routing-data');
  });

  it('ignora status webhook de wamid desconocido sin romper el endpoint', async () => {
    messageRepository.findOne.mockResolvedValue(null);

    await expect(
      service.updateDeliveryStatus({
        externalMessageId: 'wamid-missing',
        status: 'delivered',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'unknown-external-message-id',
    });
  });
});

function createThread(overrides: Partial<ServiceOrderInboxThread> = {}): ServiceOrderInboxThread {
  return {
    id: 1,
    serviceOrderId: 10,
    serviceOrder: { id: 10, assignedToTechnicianId: null, clientId: null } as any,
    clientPhoneSnapshot: '999111222',
    externalThreadKey: 'ctx-123',
    lastMessageText: null,
    lastMessageAt: null,
    lastMessageDirection: null,
    lastMessageAuthorRole: null,
    unreadForReception: 0,
    unreadForTechnician: 0,
    unreadForSupervisor: 0,
    createdAt: new Date('2026-04-05T12:00:00.000Z'),
    updatedAt: new Date('2026-04-05T12:00:00.000Z'),
    ...overrides,
  } as ServiceOrderInboxThread;
}

function createMessage(overrides: Partial<ServiceOrderInboxMessage & { attachments?: ServiceOrderInboxAttachment[] }> = {}) {
  return {
    id: 1,
    threadId: 1,
    thread: createThread(),
    direction: ServiceOrderInboxDirection.OUTBOUND,
    authorRole: ServiceOrderInboxAuthorRole.RECEPTION,
    authorUserId: 22,
    authorDisplayName: 'Recepcion',
    text: 'hola',
    deliveryStatus: ServiceOrderInboxDeliveryStatus.SENT,
    externalMessageId: 'wamid-1',
    providerPayload: null,
    createdAt: new Date('2026-04-05T12:00:00.000Z'),
    updatedAt: new Date('2026-04-05T12:00:00.000Z'),
    attachments: [],
    ...overrides,
  };
}

function createUploadedFile() {
  return {
    originalname: 'foto.jpg',
    mimetype: 'image/jpeg',
    size: 12,
    buffer: Buffer.from('fake'),
  };
}
