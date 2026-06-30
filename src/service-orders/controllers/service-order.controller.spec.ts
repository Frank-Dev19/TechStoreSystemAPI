import { BadRequestException } from '@nestjs/common';
import { ServiceOrderController } from './service-order.controller';
import { ServiceOrderService } from '../services/service-order.service';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { ServiceOrderSaleLinkService } from '../services/service-order-sale-link.service';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { ServiceOrderTechnicalStatus, ServiceType } from '../enums';

describe('ServiceOrderController', () => {
  let controller: ServiceOrderController;
  let serviceOrderService: jest.Mocked<ServiceOrderService>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let saleLinkService: jest.Mocked<ServiceOrderSaleLinkService>;
  let inboxService: jest.Mocked<ServiceOrderInboxService>;

  beforeEach(() => {
    serviceOrderService = {
      create: jest.fn(),
      createBatch: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      generateSingleOrderSummaryPdf: jest.fn(),
      update: jest.fn(),
      markAsDelivered: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      bulkSoftDelete: jest.fn(),
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderService>;

    workflowService = {
      getAssignmentSuggestion: jest.fn(),
      assignTechnician: jest.fn(),
      changeTechnicalStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    saleLinkService = {
      searchSales: jest.fn(),
      getLinksByServiceOrderIds: jest.fn(),
      linkSaleToServiceOrders: jest.fn(),
      unlink: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderSaleLinkService>;

    inboxService = {
      buildViewerContext: jest.fn(),
      getThreadForServiceOrder: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;

    controller = new ServiceOrderController(serviceOrderService, workflowService, saleLinkService, inboxService);
  });

  it('rechaza create si falta el usuario autenticado', () => {
    expect(() => controller.create({} as any, undefined)).toThrow(BadRequestException);
    expect(serviceOrderService.create).not.toHaveBeenCalled();
  });

  it('delegates create con dto y userId', async () => {
    serviceOrderService.create.mockResolvedValue({ id: 1 } as any);

    await controller.create({ initialIssue: 'No enciende' } as any, 22);

    expect(serviceOrderService.create).toHaveBeenCalledWith(expect.objectContaining({ initialIssue: 'No enciende' }), 22);
  });

  it('rechaza createBatch si falta el usuario autenticado', () => {
    expect(() => controller.createBatch({ sharedContext: {}, orders: [] } as any, undefined)).toThrow(BadRequestException);
    expect(serviceOrderService.createBatch).not.toHaveBeenCalled();
  });

  it('delegates createBatch con dto y userId', async () => {
    serviceOrderService.createBatch.mockResolvedValue({ createdOrders: [{ id: 1 }] } as any);

    await controller.createBatch(
      {
        sharedContext: { requestOrigin: 'CLIENT' as any, clientId: 22 },
        orders: [{ equipmentType: 'LAPTOP' as any, initialIssue: 'No enciende' }],
      } as any,
      22,
    );

    expect(serviceOrderService.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sharedContext: expect.objectContaining({ clientId: 22 }),
        orders: [expect.objectContaining({ initialIssue: 'No enciende' })],
      }),
      22,
    );
  });

  it('normaliza serviceOrderIds validos en billing-links/by-orders', async () => {
    saleLinkService.getLinksByServiceOrderIds.mockResolvedValue([] as any);

    await controller.getLinksByOrders('1, 2, foo, 0, -1, 9');

    expect(saleLinkService.getLinksByServiceOrderIds).toHaveBeenCalledWith([1, 2, 9]);
  });

  it('usa endpoint dedicado de entrega propagando actorId', async () => {
    serviceOrderService.markAsDelivered.mockResolvedValue({ id: 7 } as any);

    await controller.deliver(7, 44, { user: { sub: 44 } });

    expect(serviceOrderService.markAsDelivered).toHaveBeenCalledWith(7, 44, { sub: 44 });
  });

  it('resuelve el hilo unificado desde una orden', async () => {
    inboxService.buildViewerContext.mockReturnValue({ role: 'RECEPTION', userId: 22, displayName: 'Recepción' } as any);
    inboxService.getThreadForServiceOrder.mockResolvedValue({ id: 901 } as any);

    const result = await controller.getInboxThread(7, { user: { sub: 22 } });

    expect(inboxService.buildViewerContext).toHaveBeenCalledWith({ sub: 22 });
    expect(inboxService.getThreadForServiceOrder).toHaveBeenCalledWith(7, expect.objectContaining({ userId: 22 }));
    expect(result).toEqual({ id: 901 });
  });

  it('pasa el viewer al detalle de orden', async () => {
    serviceOrderService.findOne.mockResolvedValue({ id: 7 } as any);

    await controller.findOne(7, { user: { sub: 22, roles: [{ name: 'technician' }] } });

    expect(serviceOrderService.findOne).toHaveBeenCalledWith(7, false, expect.objectContaining({ sub: 22 }));
  });

  it('descarga el resumen PDF single desde backend', async () => {
    const setHeader = jest.fn();
    serviceOrderService.generateSingleOrderSummaryPdf.mockResolvedValue({
      fileName: 'SO20260520-resumen.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf'),
    });

    const result = await controller.downloadSummaryPdf(7, { user: { sub: 22 } }, { setHeader } as any);

    expect(serviceOrderService.generateSingleOrderSummaryPdf).toHaveBeenCalledWith(7, expect.objectContaining({ sub: 22 }));
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="SO20260520-resumen.pdf"');
    expect(result).toBeDefined();
  });

  it('delegates assign-technician con userId opcional', async () => {
    workflowService.assignTechnician.mockResolvedValue({ ok: true } as any);

    await controller.assignTechnician(4, { assignedToTechnicianId: 11 } as any, 90, { user: { sub: 90 } });

    expect(workflowService.assignTechnician).toHaveBeenCalledWith(4, { assignedToTechnicianId: 11 }, 90, { sub: 90 });
  });

  it('delegates transición técnica con reason', async () => {
    workflowService.changeTechnicalStatus.mockResolvedValue({ id: 5 } as any);

    await controller.changeTechnicalStatus(
      5,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      { reason: 'Aprobado por supervisor' },
      77,
      { user: { sub: 77 } },
    );

    expect(workflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      5,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      77,
      'Aprobado por supervisor',
      { sub: 77 },
    );
  });

  it('delegates technician suggestion usando serviceType', async () => {
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 3,
      technicians: [],
    } as any);

    await controller.getTechnicianSuggestion({ serviceType: ServiceType.DIAGNOSIS } as any);

    expect(workflowService.getAssignmentSuggestion).toHaveBeenCalledWith(ServiceType.DIAGNOSIS);
  });
});
