import { ServiceOrderInboxController } from './service-order-inbox.controller';
import { ServiceOrderInboxChannelService } from './service-order-inbox-channel.service';
import { ServiceOrderInboxService } from './service-order-inbox.service';

describe('ServiceOrderInboxController', () => {
  let controller: ServiceOrderInboxController;
  let inboxService: jest.Mocked<ServiceOrderInboxService>;
  let channelService: jest.Mocked<ServiceOrderInboxChannelService>;

  beforeEach(() => {
    inboxService = {
      buildViewerContext: jest.fn(),
      listThreads: jest.fn(),
      getMessages: jest.fn(),
      markThreadAsRead: jest.fn(),
      sendMessage: jest.fn(),
      downloadAttachment: jest.fn(),
      receiveInboundMessage: jest.fn(),
      updateDeliveryStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;

    channelService = {
      verifyWebhookChallenge: jest.fn(),
      assertWebhookSignature: jest.fn(),
      normalizeWebhookPayload: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxChannelService>;

    controller = new ServiceOrderInboxController(inboxService, channelService);
  });

  it('builds viewer context when listing threads', async () => {
    const viewer = { role: 'SUPERVISOR', userId: 8, displayName: 'Boss' } as any;
    inboxService.buildViewerContext.mockReturnValue(viewer);
    inboxService.listThreads.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 } as any);

    await controller.listThreads({ page: 1 } as any, { user: { id: 8 } });

    expect(inboxService.buildViewerContext).toHaveBeenCalledWith({ id: 8 });
    expect(inboxService.listThreads).toHaveBeenCalledWith({ page: 1 }, viewer);
  });

  it('delegates sendMessage con archivos normalizados y viewer context', async () => {
    const viewer = { role: 'RECEPTION', userId: 10, displayName: 'Recepcion' } as any;
    const files = [{ originalname: 'foto.jpg', mimetype: 'image/jpeg', size: 10, buffer: Buffer.from('a') }];
    inboxService.buildViewerContext.mockReturnValue(viewer);
    inboxService.sendMessage.mockResolvedValue({ id: 1 } as any);

    await controller.sendMessage(15, { text: 'hola' } as any, files as any, { user: { id: 10 } });

    expect(inboxService.sendMessage).toHaveBeenCalledWith(15, { text: 'hola' }, files, viewer);
  });

  it('descarga adjunto seteando headers y sendFile', async () => {
    const viewer = { role: 'TECHNICIAN', userId: 30, displayName: 'Tech' } as any;
    const res = {
      setHeader: jest.fn(),
      sendFile: jest.fn(),
    } as any;
    inboxService.buildViewerContext.mockReturnValue(viewer);
    inboxService.downloadAttachment.mockResolvedValue({
      mimeType: 'application/pdf',
      fileName: 'orden final.pdf',
      absolutePath: 'C:/tmp/orden-final.pdf',
    } as any);

    await controller.downloadAttachment(9, { user: { id: 30 } }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="orden%20final.pdf"',
    );
    expect(res.sendFile).toHaveBeenCalledWith('C:/tmp/orden-final.pdf');
  });

  it('verifica webhook challenge respondiendo 200', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;
    channelService.verifyWebhookChallenge.mockReturnValue('challenge-ok');

    controller.verifyWebhook('subscribe', 'token', 'abc', res);

    expect(channelService.verifyWebhookChallenge).toHaveBeenCalledWith('subscribe', 'token', 'abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('challenge-ok');
  });

  it('procesa webhook normalizado y actualiza mensajes + estados', async () => {
    channelService.normalizeWebhookPayload.mockReturnValue({
      messages: [{ externalMessageId: 'wamid-1' }],
      statuses: [{ externalMessageId: 'wamid-1', status: 'delivered' }],
    } as any);

    const result = await controller.receiveWebhook({ entry: [] }, 'sha256=firma', { rawBody: Buffer.from('raw') });

    expect(channelService.assertWebhookSignature).toHaveBeenCalledWith(Buffer.from('raw'), 'sha256=firma');
    expect(inboxService.receiveInboundMessage).toHaveBeenCalledWith({ externalMessageId: 'wamid-1' });
    expect(inboxService.updateDeliveryStatus).toHaveBeenCalledWith({ externalMessageId: 'wamid-1', status: 'delivered' });
    expect(result).toEqual({ ok: true, receivedMessages: 1, receivedStatuses: 1 });
  });

  it('no rompe el webhook cuando llega un status para un wamid desconocido', async () => {
    channelService.normalizeWebhookPayload.mockReturnValue({
      messages: [],
      statuses: [{ externalMessageId: 'wamid-missing', status: 'delivered' }],
    } as any);
    inboxService.updateDeliveryStatus.mockResolvedValue({ ok: false, reason: 'unknown-external-message-id' } as any);

    const result = await controller.receiveWebhook({ entry: [] }, 'sha256=firma', { rawBody: Buffer.from('raw') });

    expect(result).toEqual({ ok: true, receivedMessages: 0, receivedStatuses: 1 });
  });

  it('procesa statuses aunque un inbound message falle por routing de dominio', async () => {
    channelService.normalizeWebhookPayload.mockReturnValue({
      messages: [{ externalMessageId: 'wamid-inbound-1' }],
      statuses: [{ externalMessageId: 'wamid-1', status: 'delivered' }],
    } as any);
    inboxService.receiveInboundMessage.mockRejectedValue(new Error('No se pudo resolver el hilo del mensaje entrante (missing-routing-data)'));
    inboxService.updateDeliveryStatus.mockResolvedValue({ ok: true } as any);

    await expect(
      controller.receiveWebhook({ entry: [] }, 'sha256=firma', { rawBody: Buffer.from('raw') }),
    ).rejects.toThrow('missing-routing-data');

    expect(inboxService.updateDeliveryStatus).toHaveBeenCalledWith({ externalMessageId: 'wamid-1', status: 'delivered' });
  });
});
