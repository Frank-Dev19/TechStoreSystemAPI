import { BadRequestException } from '@nestjs/common';
import { ServiceOrderController } from './service-order.controller';
import { ServiceOrderService } from '../services/service-order.service';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { ServiceOrderSaleLinkService } from '../services/service-order-sale-link.service';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { ServiceOrderTechnicalStatus, ServiceType } from '../enums';
import { ServiceOrderAggregateService } from '../services/service-order-aggregate.service';
import { ServiceOrderItemWorkflowService } from '../services/service-order-item-workflow.service';
import { ServiceOrderItemCancellationService } from '../services/service-order-item-cancellation.service';
import { ServiceOrderItemDeliveryService } from '../services/service-order-item-delivery.service';
import { ServiceOrderCancellationChannel, ServiceOrderCancellationResolution } from '../enums';

describe('ServiceOrderController', () => {
  let controller: ServiceOrderController;
  let serviceOrderService: jest.Mocked<ServiceOrderService>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let saleLinkService: jest.Mocked<ServiceOrderSaleLinkService>;
  let inboxService: jest.Mocked<ServiceOrderInboxService>;
  let aggregateService: jest.Mocked<ServiceOrderAggregateService>;
  let itemWorkflowService: jest.Mocked<ServiceOrderItemWorkflowService>;
  let itemCancellationService: jest.Mocked<ServiceOrderItemCancellationService>;
  let itemDeliveryService: jest.Mocked<ServiceOrderItemDeliveryService>;

  beforeEach(() => {
    serviceOrderService = {
      create: jest.fn(),
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
    aggregateService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderAggregateService>;
    itemWorkflowService = {
      changeTechnicalStatus: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderItemWorkflowService>;
    itemCancellationService = {
      requestCancellation: jest.fn(),
      resolveCancellation: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderItemCancellationService>;
    itemDeliveryService = {
      deliverItem: jest.fn(),
      deliverOnlyItem: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderItemDeliveryService>;

    controller = new ServiceOrderController(
      serviceOrderService,
      aggregateService,
      itemWorkflowService,
      itemCancellationService,
      itemDeliveryService,
      workflowService,
      saleLinkService,
      inboxService,
    );
  });

  it('delega la solicitud de cancelación por equipo con actor y viewer', async () => {
    itemCancellationService.requestCancellation.mockResolvedValue({ request: { id: 80 } } as any);
    const dto = { channel: ServiceOrderCancellationChannel.WHATSAPP, reason: 'Cliente desistió.' };

    await controller.requestItemCancellation(7, 71, dto, 44, { user: { sub: 44 } });

    expect(itemCancellationService.requestCancellation).toHaveBeenCalledWith(7, 71, dto, 44, { sub: 44 });
  });

  it('delega la resolución supervisada de una cancelación tardía', async () => {
    itemCancellationService.resolveCancellation.mockResolvedValue({ request: { id: 80 } } as any);
    const dto = {
      resolution: ServiceOrderCancellationResolution.REJECTED,
      reason: 'Se continuará con el servicio.',
    };

    await controller.resolveItemCancellation(7, 71, 80, dto, 3, { user: { sub: 3 } });

    expect(itemCancellationService.resolveCancellation).toHaveBeenCalledWith(7, 71, 80, dto, 3, { sub: 3 });
  });

  it('delega la entrega del equipo seleccionado con actor y viewer', async () => {
    itemDeliveryService.deliverItem.mockResolvedValue({ id: 7 } as any);

    await controller.deliverItem(7, 71, 44, { user: { sub: 44 } });

    expect(itemDeliveryService.deliverItem).toHaveBeenCalledWith(7, 71, 44, { sub: 44 });
  });

  it('rechaza create si falta el usuario autenticado', () => {
    expect(() => controller.create({} as any, undefined)).toThrow(BadRequestException);
    expect(aggregateService.create).not.toHaveBeenCalled();
  });

  it('delega una cabecera con items al servicio agregado', async () => {
    aggregateService.create.mockResolvedValue({ id: 1 } as any);

    await controller.create({ serviceType: ServiceType.DIAGNOSIS, items: [{ initialIssue: 'No enciende' }] } as any, 22);

    expect(aggregateService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceType: ServiceType.DIAGNOSIS,
        items: [expect.objectContaining({ initialIssue: 'No enciende' })],
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
    itemDeliveryService.deliverOnlyItem.mockResolvedValue({ id: 7 } as any);

    await controller.deliver(7, 44, { user: { sub: 44 } });

    expect(itemDeliveryService.deliverOnlyItem).toHaveBeenCalledWith(7, 44, { sub: 44 });
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

  it('delega la transición técnica de un equipo sin cambiar a sus hermanos', async () => {
    itemWorkflowService.changeTechnicalStatus.mockResolvedValue({ id: 5 } as any);

    await controller.changeItemTechnicalStatus(
      5,
      51,
      ServiceOrderTechnicalStatus.RESUELTA,
      { reason: 'Equipo reparado' },
      77,
      { user: { sub: 77 } },
    );

    expect(itemWorkflowService.changeTechnicalStatus).toHaveBeenCalledWith(
      5,
      51,
      ServiceOrderTechnicalStatus.RESUELTA,
      77,
      'Equipo reparado',
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
