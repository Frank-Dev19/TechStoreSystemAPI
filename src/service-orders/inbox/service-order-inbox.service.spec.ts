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
