import { ForbiddenException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { ServiceOrderInboxService } from './service-order-inbox.service';
import { ServiceOrderInboxChannelService } from './service-order-inbox-channel.service';
import { ServiceOrderInboxAttachment } from './entities/service-order-inbox-attachment.entity';
import { ServiceOrderInboxMessage } from './entities/service-order-inbox-message.entity';
import { ServiceOrderInboxMessageOrderLink } from './entities/service-order-inbox-message-order-link.entity';
import { ServiceOrderInboxThread } from './entities/service-order-inbox-thread.entity';
import { ServiceOrderInboxThreadOrderLink } from './entities/service-order-inbox-thread-order-link.entity';
import { ServiceOrderInboxAuthorRole, ServiceOrderInboxDeliveryStatus, ServiceOrderInboxDirection } from './service-order-inbox.types';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  createQueryBuilder: jest.Mock;
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  find: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('ServiceOrderInboxService', () => {
  let service: ServiceOrderInboxService;
  let threadRepository: MockRepo<ServiceOrderInboxThread>;
  let messageRepository: MockRepo<ServiceOrderInboxMessage>;
  let attachmentRepository: MockRepo<ServiceOrderInboxAttachment>;
  let threadOrderLinkRepository: MockRepo<ServiceOrderInboxThreadOrderLink>;
  let messageOrderLinkRepository: MockRepo<ServiceOrderInboxMessageOrderLink>;
  let serviceOrderRepository: MockRepo;
  let channelService: jest.Mocked<ServiceOrderInboxChannelService>;
  let messageIdSequence: number;

  beforeEach(() => {
    threadRepository = createMockRepo<ServiceOrderInboxThread>();
    messageRepository = createMockRepo<ServiceOrderInboxMessage>();
    attachmentRepository = createMockRepo<ServiceOrderInboxAttachment>();
    threadOrderLinkRepository = createMockRepo<ServiceOrderInboxThreadOrderLink>();
    messageOrderLinkRepository = createMockRepo<ServiceOrderInboxMessageOrderLink>();
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
      threadOrderLinkRepository as any,
      messageOrderLinkRepository as any,
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
    jest.spyOn(service, 'hasCustomerServiceWindow').mockResolvedValue(true);
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
    jest.spyOn(service, 'hasCustomerServiceWindow').mockResolvedValue(true);
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

  it('rechaza mensajes manuales cuando la ventana de 24h está cerrada', async () => {
    const thread = createThread();

    jest.spyOn(service as any, 'getThreadWithAccess').mockResolvedValue(thread);
    jest.spyOn(service, 'hasCustomerServiceWindow').mockResolvedValue(false);

    await expect(
      service.sendMessage(
        thread.id,
        { text: 'hola cliente' },
        [],
        { role: 'RECEPTION', userId: 22, displayName: 'Recepcion' },
      ),
    ).rejects.toThrow('No se pueden enviar mensajes manuales porque la ventana de 24 horas de WhatsApp está cerrada.');

    expect(channelService.dispatchTextMessage).not.toHaveBeenCalled();
  });

  it('ordena threads sin usar expresiones que TypeORM no puede resolver como alias', async () => {
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
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
      .mockResolvedValueOnce({
        orderLinks: [],
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

  it('consolida hilos por teléfono y acepta inbound ambiguo en bandeja unificada', async () => {
    threadRepository.find.mockResolvedValue([
      createThread({ id: 11, clientPhoneSnapshot: '51999111222' }),
      createThread({ id: 12, clientPhoneSnapshot: '51999111222' }),
    ] as any);
    threadOrderLinkRepository.find.mockResolvedValue([]);
    threadRepository.findOne.mockResolvedValue(createThread({ id: 11, clientPhoneSnapshot: '51999111222' }) as any);
    messageRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createMessage({
        id: 93,
        threadId: 11,
        direction: ServiceOrderInboxDirection.INBOUND,
        authorRole: ServiceOrderInboxAuthorRole.CLIENT,
        text: 'hola',
        deliveryStatus: ServiceOrderInboxDeliveryStatus.RECEIVED,
        externalMessageId: 'wamid-inbound-3',
      }) as any);

    const result = await service.receiveInboundMessage({
      externalMessageId: 'wamid-inbound-3',
      from: '+51999111222',
      text: 'hola',
      attachments: [],
    });

    expect(result.id).toBe(93);
    expect(threadRepository.delete).toHaveBeenCalledWith({ id: 12 });
  });

  it('puede consolidar hilos históricos duplicados por teléfono de forma explícita', async () => {
    threadRepository.find
      .mockResolvedValueOnce([
        createThread({ id: 21, clientPhoneSnapshot: '51999111222' }),
        createThread({ id: 22, clientPhoneSnapshot: '51999111222' }),
        createThread({ id: 23, clientPhoneSnapshot: '51988777666' }),
      ] as any)
      .mockResolvedValueOnce([]);
    threadOrderLinkRepository.find.mockResolvedValue([]);
    threadRepository.findOne.mockResolvedValue(createThread({ id: 21, clientPhoneSnapshot: '51999111222' }) as any);

    const consolidated = await service.consolidateHistoricalThreads();

    expect(consolidated).toBe(1);
    expect(threadRepository.delete).toHaveBeenCalledWith({ id: 22 });
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

  it('expone la conversación completa del cliente a técnicos con una orden activa asignada en el hilo', async () => {
    const technicianViewer = { role: 'TECHNICIAN' as const, userId: 7, displayName: 'Tecnico 7' };
    const thread = createThread({
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, code: 'SO-001', assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, code: 'SO-002', assignedToTechnicianId: 8 }) }),
      ],
    });
    const visibleMessage = createMessage({
      id: 1,
      threadId: thread.id,
      text: 'visible',
      orderLinks: [createMessageOrderLink({ messageId: 1, serviceOrderId: 10 })],
    });
    const hiddenMessage = createMessage({
      id: 2,
      threadId: thread.id,
      text: 'hidden',
      orderLinks: [createMessageOrderLink({ messageId: 2, serviceOrderId: 11 })],
    });
    const ambiguousMessage = createMessage({ id: 3, threadId: thread.id, text: 'ambiguous', orderLinks: [] });

    jest.spyOn(service as any, 'getThreadWithAccess').mockResolvedValue(thread);
    messageRepository.find.mockResolvedValue([visibleMessage, hiddenMessage, ambiguousMessage] as any);

    const result = await service.getMessages(thread.id, technicianViewer);
    const orders = await service.listThreadOrders(thread.id, technicianViewer);

    expect(result.thread.serviceOrderIds).toEqual([10, 11]);
    expect(result.messages).toEqual([
      expect.objectContaining({ id: 1, serviceOrderIds: [10] }),
      expect.objectContaining({ id: 2, serviceOrderIds: [11] }),
      expect.objectContaining({ id: 3, serviceOrderIds: [] }),
    ]);
    expect(orders.map((order) => order.id)).toEqual([10, 11]);
  });

  it('resume el último mensaje real del canal para técnicos aunque pertenezca a otra orden activa del hilo', async () => {
    const technicianViewer = { role: 'TECHNICIAN' as const, userId: 7, displayName: 'Tecnico 7' };
    const thread = createThread({
      lastMessageText: 'hidden latest',
      lastMessageAt: new Date('2026-04-05T14:00:00.000Z'),
      lastCustomerMessageAt: new Date('2026-04-05T14:00:00.000Z'),
      lastMessageDirection: ServiceOrderInboxDirection.INBOUND,
      lastMessageAuthorRole: ServiceOrderInboxAuthorRole.CLIENT,
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, code: 'SO-001', assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, code: 'SO-002', assignedToTechnicianId: 8 }) }),
      ],
    });
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[thread], 1]),
    };
    threadRepository.createQueryBuilder.mockReturnValue(qb as any);
    messageRepository.find.mockResolvedValue([
      createMessage({
        id: 1,
        threadId: thread.id,
        text: 'visible older',
        createdAt: new Date('2026-04-05T13:00:00.000Z'),
        direction: ServiceOrderInboxDirection.OUTBOUND,
        authorRole: ServiceOrderInboxAuthorRole.TECHNICIAN,
        orderLinks: [createMessageOrderLink({ messageId: 1, serviceOrderId: 10 })],
      }),
      createMessage({
        id: 2,
        threadId: thread.id,
        text: 'hidden latest',
        createdAt: new Date('2026-04-05T14:00:00.000Z'),
        direction: ServiceOrderInboxDirection.INBOUND,
        authorRole: ServiceOrderInboxAuthorRole.CLIENT,
        orderLinks: [createMessageOrderLink({ messageId: 2, serviceOrderId: 11 })],
      }),
    ] as any);

    const result = await service.listThreads({ page: 1, limit: 10 }, technicianViewer);

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        serviceOrderIds: [10, 11],
        lastMessageText: 'hidden latest',
        lastMessageAt: '2026-04-05T14:00:00.000Z',
        lastCustomerMessageAt: '2026-04-05T14:00:00.000Z',
        lastMessageDirection: ServiceOrderInboxDirection.INBOUND,
        lastMessageAuthorRole: ServiceOrderInboxAuthorRole.CLIENT,
      }),
    );
  });

  it('permite descargar adjuntos del hilo cuando el técnico tiene una orden activa asignada en ese canal', async () => {
    const technicianViewer = { role: 'TECHNICIAN' as const, userId: 7, displayName: 'Tecnico 7' };
    const thread = createThread({
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, assignedToTechnicianId: 8 }) }),
      ],
    });
    attachmentRepository.findOne.mockResolvedValue({
      id: 501,
      fileName: 'secreto.pdf',
      mimeType: 'application/pdf',
      cachedFilePath: 'C:/tmp/secreto.pdf',
      providerMediaId: null,
      attachmentType: 'pdf',
      message: {
        id: 22,
        threadId: thread.id,
        thread,
        orderLinks: [createMessageOrderLink({ messageId: 22, serviceOrderId: 11 })],
      },
    } as any);

    const accessSpy = jest.spyOn(fs, 'access').mockResolvedValue(undefined);

    await expect(service.downloadAttachment(501, technicianViewer)).resolves.toEqual({
      fileName: 'secreto.pdf',
      mimeType: 'application/pdf',
      absolutePath: 'C:\\tmp\\secreto.pdf',
    });

    accessSpy.mockRestore();
  });

  it('rechaza que un técnico quite o reemplace vínculos de mensajes ajenos dentro del mismo hilo consolidado', async () => {
    const technicianViewer = { role: 'TECHNICIAN' as const, userId: 7, displayName: 'Tecnico 7' };
    const thread = createThread({
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, assignedToTechnicianId: 8 }) }),
      ],
    });
    messageRepository.findOne.mockResolvedValue({
      id: 31,
      threadId: thread.id,
      thread,
      orderLinks: [createMessageOrderLink({ messageId: 31, serviceOrderId: 11 })],
    } as any);

    await expect(service.replaceMessageOrderLinks(31, [], technicianViewer)).rejects.toThrow(ForbiddenException);
    await expect(service.replaceMessageOrderLinks(31, [10], technicianViewer)).rejects.toThrow(ForbiddenException);
    expect(messageOrderLinkRepository.remove).not.toHaveBeenCalled();
  });

  it('rechaza que un técnico envíe mensajes asociados a órdenes no asignadas del mismo hilo', async () => {
    const technicianViewer = { role: 'TECHNICIAN' as const, userId: 7, displayName: 'Tecnico 7' };
    const thread = createThread({
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, assignedToTechnicianId: 8 }) }),
      ],
    });

    jest.spyOn(service as any, 'getThreadWithAccess').mockResolvedValue(thread);

    await expect(
      service.sendMessage(thread.id, { text: 'hola', serviceOrderIds: [11] }, [], technicianViewer),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza acceso al hilo para un técnico sin ninguna orden activa asignada en ese canal', async () => {
    const technicianViewer = { role: 'TECHNICIAN' as const, userId: 9, displayName: 'Tecnico 9' };
    const thread = createThread({
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, assignedToTechnicianId: 8 }) }),
      ],
    });

    threadRepository.findOne.mockResolvedValue(thread as any);

    await expect(service.getMessages(thread.id, technicianViewer)).rejects.toThrow(ForbiddenException);
  });

  it('mantiene capacidad de relink completo para roles elevados en hilos compartidos', async () => {
    const adminViewer = { role: 'ADMIN' as const, userId: 1, displayName: 'Admin' };
    const thread = createThread({
      orderLinks: [
        createThreadOrderLink({ serviceOrderId: 10, serviceOrder: createServiceOrderStub({ id: 10, assignedToTechnicianId: 7 }) }),
        createThreadOrderLink({ serviceOrderId: 11, serviceOrder: createServiceOrderStub({ id: 11, assignedToTechnicianId: 8 }) }),
      ],
    });

    messageRepository.findOne.mockResolvedValue({
      id: 31,
      threadId: thread.id,
      thread,
      orderLinks: [createMessageOrderLink({ messageId: 31, serviceOrderId: 11 })],
    } as any);
    messageOrderLinkRepository.find.mockResolvedValue([
      createMessageOrderLink({ id: 901, messageId: 31, serviceOrderId: 11 }),
    ] as any);

    await expect(service.replaceMessageOrderLinks(31, [10], adminViewer)).resolves.toEqual({
      ok: true,
      messageId: 31,
      serviceOrderIds: [10],
    });

    expect(messageOrderLinkRepository.remove).toHaveBeenCalled();
    expect(messageOrderLinkRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ messageId: 31, serviceOrderId: 10 }),
    ]);
  });

  it('trata admin + technician como acceso elevado y no como técnico restringido', () => {
    expect(
      service.buildViewerContext({ sub: 99, roles: [{ name: 'admin' }, { name: 'technician' }] }),
    ).toEqual({
      userId: 99,
      displayName: null,
      role: 'ADMIN',
    });
  });
});

function createThread(overrides: Partial<ServiceOrderInboxThread> = {}): ServiceOrderInboxThread {
  return {
    id: 1,
    clientId: 20,
    clientPhoneSnapshot: '999111222',
    clientDisplayNameSnapshot: 'Cliente Demo',
    externalThreadKey: 'ctx-123',
    lastMessageText: null,
    lastMessageAt: null,
    lastCustomerMessageAt: null,
    lastMessageDirection: null,
    lastMessageAuthorRole: null,
    unreadForReception: 0,
    unreadForTechnician: 0,
    unreadForSupervisor: 0,
    createdAt: new Date('2026-04-05T12:00:00.000Z'),
    updatedAt: new Date('2026-04-05T12:00:00.000Z'),
    orderLinks: [
      {
        id: 401,
        threadId: 1,
        serviceOrderId: 10,
        serviceOrder: { id: 10, code: 'SO-001', assignedToTechnicianId: null, clientId: 20, operativeStatus: 'ABIERTA' } as any,
        createdAt: new Date('2026-04-05T12:00:00.000Z'),
      } as any,
    ],
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
    orderLinks: [],
    ...overrides,
  };
}

function createThreadOrderLink(overrides: Partial<ServiceOrderInboxThreadOrderLink> = {}): ServiceOrderInboxThreadOrderLink {
  return {
    id: 401,
    threadId: 1,
    serviceOrderId: 10,
    serviceOrder: createServiceOrderStub(),
    createdAt: new Date('2026-04-05T12:00:00.000Z'),
    ...overrides,
  } as ServiceOrderInboxThreadOrderLink;
}

function createMessageOrderLink(overrides: Partial<ServiceOrderInboxMessageOrderLink> = {}): ServiceOrderInboxMessageOrderLink {
  return {
    id: 801,
    messageId: 1,
    serviceOrderId: 10,
    createdAt: new Date('2026-04-05T12:00:00.000Z'),
    ...overrides,
  } as ServiceOrderInboxMessageOrderLink;
}

function createServiceOrderStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    code: 'SO-001',
    assignedToTechnicianId: null,
    assignedTechnician: null,
    clientId: 20,
    operativeStatus: 'ABIERTA',
    technicalStatus: 'PENDIENTE_ASIGNACION',
    commercialStatus: 'NO_REQUIERE',
    economicStatus: 'NO_APLICA',
    equipmentType: 'LAPTOP',
    equipmentTypeOther: null,
    brand: null,
    model: null,
    clientSnapshotName: 'Cliente Demo',
    ...overrides,
  } as any;
}

function createUploadedFile() {
  return {
    originalname: 'foto.jpg',
    mimetype: 'image/jpeg',
    size: 12,
    buffer: Buffer.from('fake'),
  };
}
