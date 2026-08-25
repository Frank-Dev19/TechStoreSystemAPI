import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientContact } from '../../clients/entities/client-contact.entity';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { ServiceOrderIntakePdfService } from '../documents/service-order-intake-pdf.service';
import { ServiceOrderTempDocumentsService } from '../documents/service-order-temp-documents.service';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import {
  EquipmentType,
  RequestOrigin,
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderPriority,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';
import { ServiceOrderMetricsFactory } from './service-order-metrics.factory';
import { ServiceOrderService } from './service-order.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';
import { DataSource } from 'typeorm';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  softDelete: jest.Mock;
  restore: jest.Mock;
  update: jest.Mock;
};

const createMockRepo = <T = any>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  update: jest.fn(),
});

const createServiceOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder =>
  ({
    id: 1,
    code: 'SO-001',
    operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
    technicalStatus: ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION,
    commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
    economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
    priority: ServiceOrderPriority.MEDIUM,
    requestOrigin: RequestOrigin.INTERNAL,
    equipmentType: EquipmentType.LAPTOP,
    equipmentTypeOther: null,
    brand: null,
    model: null,
    serialNumber: null,
    accessories: null,
    serviceType: ServiceType.DIAGNOSIS,
    initialIssue: 'No enciende',
    estimatedRepairHours: null,
    assignedTechnician: null,
    assignedToTechnicianId: null,
    assignedAt: null,
    client: null,
    clientId: null,
    clientSnapshotName: null,
    clientSnapshotDocumentTypeName: null,
    clientSnapshotDocumentNumber: null,
    clientSnapshotPhone: null,
    clientSnapshotEmail: null,
    creator: undefined as any,
    createdBy: 5,
    closer: null,
    closedBy: null,
    canceller: null,
    cancelledBy: null,
    estimatedDeliveryDate: null,
    receivedAt: new Date('2026-01-01T10:00:00.000Z'),
    reviewStartedAt: null,
    serviceStartedAt: null,
    serviceCompletedAt: null,
    readyForPickupAt: null,
    resolvedAt: null,
    deliveredAt: null,
    closedAt: null,
    cancelledAt: null,
    notes: null,
    montoComprometidoVigente: 0,
    montoReconciliado: 0,
    discount: 0,
    cancellationReason: null,
    rating: null,
    ratingComment: null,
    ratedAt: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as ServiceOrder;

describe('ServiceOrderService', () => {
  let service: ServiceOrderService;
  let dataSource: jest.Mocked<DataSource>;
  let serviceOrderRepository: MockRepo<ServiceOrder>;
  let clientRepository: MockRepo<Client>;
  let clientContactRepository: MockRepo<ClientContact>;
  let userRepository: MockRepo<User>;
  let eventRepository: MockRepo<ServiceOrderEvent>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let messageMatrixService: jest.Mocked<ServiceOrderMessageMatrixService>;
  let metricsFactory: jest.Mocked<ServiceOrderMetricsFactory>;
  let tempDocumentsService: jest.Mocked<ServiceOrderTempDocumentsService>;
  let intakePdfService: jest.Mocked<ServiceOrderIntakePdfService>;
  let configService: jest.Mocked<ConfigService>;
  let inboxService: jest.Mocked<ServiceOrderInboxService>;

  const createTransactionManager = (overrides?: Partial<Record<string, MockRepo<any>>>) => ({
    getRepository: jest.fn((entity: { name?: string }) => {
      const repositories: Record<string, MockRepo<any>> = {
        ServiceOrder: overrides?.ServiceOrder ?? serviceOrderRepository,
        Client: overrides?.Client ?? clientRepository,
        ClientContact: overrides?.ClientContact ?? clientContactRepository,
        User: overrides?.User ?? userRepository,
        ServiceOrderEvent: overrides?.ServiceOrderEvent ?? eventRepository,
      };

      const repository = repositories[entity?.name ?? ''];
      if (!repository) {
        throw new Error(`Unexpected repository request for ${entity?.name ?? 'unknown entity'}`);
      }

      return repository;
    }),
  });

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (...args: any[]) => {
        const callback = args[args.length - 1] as (manager: ReturnType<typeof createTransactionManager>) => unknown;
        return callback(createTransactionManager());
      }),
      getRepository: jest.fn((entity: { name?: string }) => createTransactionManager().getRepository(entity)),
    } as unknown as jest.Mocked<DataSource>;

    serviceOrderRepository = createMockRepo<ServiceOrder>();
    clientRepository = createMockRepo<Client>();
    clientContactRepository = createMockRepo<ClientContact>();
    userRepository = createMockRepo<User>();
    eventRepository = createMockRepo<ServiceOrderEvent>();

    workflowService = {
      ensureTechnicianAvailable: jest.fn(),
      getAssignmentSuggestion: jest.fn(),
      registerInitialAssignment: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;

    messageMatrixService = {
      notifySurveyRequest: jest.fn(),
      dispatchOrderIntakeTemplate: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderMessageMatrixService>;

    metricsFactory = {
      build: jest.fn((serviceOrder: ServiceOrder) => ({
        sla: {
          stage: 'service',
          targetMinutes: 180,
          elapsedMinutes: 60,
          remainingMinutes: 120,
          breached: false,
        },
        timeMetrics: {
          timeToDiagnosis: { valueMinutes: 120, isComputable: true, missingTimestamps: [] },
          timeToServiceStart: { valueMinutes: 240, isComputable: true, missingTimestamps: [] },
          timeToService: { valueMinutes: 150, isComputable: true, missingTimestamps: [] },
          timeToResolution: { valueMinutes: null, isComputable: false, missingTimestamps: ['resolvedAt'] },
          timeToDelivery: { valueMinutes: null, isComputable: false, missingTimestamps: ['deliveredAt'] },
        },
      })),
      buildItemSla: jest.fn(() => ({
        stage: 'service',
        targetMinutes: 180,
        elapsedMinutes: 60,
        remainingMinutes: 120,
        breached: false,
      })),
    } as unknown as jest.Mocked<ServiceOrderMetricsFactory>;

    tempDocumentsService = {
      createRecord: jest.fn().mockResolvedValue({ token: 'temp-token' }),
    } as unknown as jest.Mocked<ServiceOrderTempDocumentsService>;

    intakePdfService = {
      generate: jest.fn().mockResolvedValue({
        fileName: 'resumen-ordenes.pdf',
        absolutePath: 'C:/tmp/resumen-ordenes.pdf',
        mimeType: 'application/pdf',
      }),
      generateSingleOrderSummaryBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    } as unknown as jest.Mocked<ServiceOrderIntakePdfService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'APP_PUBLIC_BASE_URL') return 'https://stsperu.online/api';
        if (key === 'WHATSAPP_TEMPLATE_ORDER_INTAKE_NAME') return 'ordenes_ingresadas_asignadas';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    inboxService = {
      syncThreadClientPhoneSnapshotForOrder: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInboxService>;

    service = new ServiceOrderService(
      dataSource,
      serviceOrderRepository as any,
      clientRepository as any,
      clientContactRepository as any,
      userRepository as any,
      eventRepository as any,
      workflowService,
      messageMatrixService,
      metricsFactory,
      tempDocumentsService,
      intakePdfService,
      configService,
      inboxService,
    );
  });

  it('treats single order creation as a batch of one for whatsapp intake dispatch', async () => {
    const created = createServiceOrder({
      id: 99,
      code: 'SO-TEST-001',
      clientId: 30,
      clientSnapshotName: 'Juan Pérez',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'PERSON', documentType: { name: 'DNI' } } as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 99 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-001');

    const result = await service.create(
      {
        requestOrigin: RequestOrigin.CLIENT,
        clientId: 30,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'No enciende',
      },
      5,
    );

    expect(result.code).toBeDefined();
    expect(messageMatrixService.dispatchOrderIntakeTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrders: [expect.objectContaining({ id: result.id })],
      }),
    );
  });

  it('creates all orders and dispatches one intake template for the batch', async () => {
    const firstOrder = createServiceOrder({
      id: 201,
      code: 'SO-BATCH-001',
      clientId: 30,
      clientContactId: 88,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const secondOrder = createServiceOrder({
      id: 202,
      code: 'SO-BATCH-002',
      clientId: 30,
      clientContactId: 88,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any);
    clientContactRepository.findOne.mockResolvedValue({
      id: 88,
      clientId: 30,
      name: 'Carlos Avila',
      isPrimary: true,
      isActive: true,
    } as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save
      .mockImplementationOnce(async (value) => ({ ...value, id: 201 }))
      .mockImplementationOnce(async (value) => ({ ...value, id: 202 }));
    serviceOrderRepository.findOne.mockResolvedValueOnce(firstOrder).mockResolvedValueOnce(secondOrder);
    jest
      .spyOn(service as any, 'generateUniqueCode')
      .mockResolvedValueOnce('SO-BATCH-001')
      .mockResolvedValueOnce('SO-BATCH-002');

    const result = await service.createBatch(
      {
        sharedContext: {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
          clientContactId: 88,
          contactName: 'Carlos Avila',
        },
        orders: [
          {
            equipmentType: EquipmentType.LAPTOP,
            brand: 'Lenovo',
            initialIssue: 'No enciende',
          },
          {
            equipmentType: EquipmentType.PRINTER,
            brand: 'Epson',
            initialIssue: 'Atasco de papel',
          },
        ],
      },
      5,
    );

    expect(result.createdOrders).toHaveLength(2);
    expect(intakePdfService.generate).toHaveBeenCalled();
    expect(tempDocumentsService.createRecord).toHaveBeenCalled();
    expect(messageMatrixService.dispatchOrderIntakeTemplate).toHaveBeenCalledTimes(1);
  });

  it('rolls back the whole batch when a later order fails inside the transaction and skips post-commit dispatch', async () => {
    const firstOrder = createServiceOrder({
      id: 301,
      code: 'SO-BATCH-301',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const secondOrder = createServiceOrder({
      id: 302,
      code: 'SO-BATCH-302',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const transactionalServiceOrderRepository = createMockRepo<ServiceOrder>();
    const manager = createTransactionManager({ ServiceOrder: transactionalServiceOrderRepository });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    transactionalServiceOrderRepository.create.mockImplementation((value) => value);
    transactionalServiceOrderRepository.save
      .mockImplementationOnce(async (value) => ({ ...value, id: 301 }))
      .mockImplementationOnce(async (value) => ({ ...value, id: 302 }));
    transactionalServiceOrderRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(firstOrder)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(secondOrder);
    transactionalServiceOrderRepository.createQueryBuilder.mockReturnValue({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ code: 'SO-BATCH-301' }),
    });
    workflowService.registerInitialAssignment
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new BadRequestException('No hay tecnicos disponibles para asignar ordenes'));
    dataSource.transaction.mockImplementation(async (...args: any[]) => {
      const callback = args[args.length - 1] as (transactionManager: typeof manager) => unknown;
      return callback(manager as any);
    });

    await expect(
      service.createBatch(
        {
          sharedContext: {
            requestOrigin: RequestOrigin.CLIENT,
            clientId: 30,
          },
          orders: [
            {
              equipmentType: EquipmentType.LAPTOP,
              initialIssue: 'No enciende',
            },
            {
              equipmentType: EquipmentType.PRINTER,
              initialIssue: 'Atasco de papel',
            },
          ],
        },
        5,
      ),
    ).rejects.toThrow('No hay tecnicos disponibles para asignar ordenes');

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
    expect(transactionalServiceOrderRepository.save).toHaveBeenCalledTimes(2);
    expect(workflowService.registerInitialAssignment).toHaveBeenCalledTimes(2);
    expect(intakePdfService.generate).not.toHaveBeenCalled();
    expect(tempDocumentsService.createRecord).not.toHaveBeenCalled();
    expect(messageMatrixService.dispatchOrderIntakeTemplate).not.toHaveBeenCalled();
  });

  it('passes the batch transaction manager into assignment suggestions for later orders', async () => {
    const firstOrder = createServiceOrder({
      id: 421,
      code: 'SO-BATCH-421',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const secondOrder = createServiceOrder({
      id: 422,
      code: 'SO-BATCH-422',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 8, name: 'Ana Torres' } as any,
    });
    const transactionalServiceOrderRepository = createMockRepo<ServiceOrder>();
    const manager = createTransactionManager({ ServiceOrder: transactionalServiceOrderRepository });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any);
    workflowService.getAssignmentSuggestion
      .mockResolvedValueOnce({
        serviceType: ServiceType.DIAGNOSIS,
        suggestedTechnicianId: 7,
        technicians: [],
      })
      .mockResolvedValueOnce({
        serviceType: ServiceType.DIAGNOSIS,
        suggestedTechnicianId: 8,
        technicians: [],
      })
      .mockResolvedValueOnce({
        serviceType: ServiceType.DIAGNOSIS,
        suggestedTechnicianId: 7,
        technicians: [],
      })
      .mockResolvedValueOnce({
        serviceType: ServiceType.DIAGNOSIS,
        suggestedTechnicianId: 8,
        technicians: [],
      });
    transactionalServiceOrderRepository.create.mockImplementation((value) => value);
    transactionalServiceOrderRepository.save
      .mockImplementationOnce(async (value) => ({ ...value, id: 421 }))
      .mockImplementationOnce(async (value) => ({ ...value, id: 422 }));
    transactionalServiceOrderRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(firstOrder)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(secondOrder);
    transactionalServiceOrderRepository.createQueryBuilder.mockReturnValue({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ code: 'SO-BATCH-421' }),
    });
    workflowService.registerInitialAssignment.mockResolvedValue(undefined);
    dataSource.transaction.mockImplementation(async (...args: any[]) => {
      const callback = args[args.length - 1] as (transactionManager: typeof manager) => Promise<unknown>;
      return callback(manager as any);
    });

    const result = await service.createBatch(
      {
        sharedContext: {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
        },
        orders: [
          {
            equipmentType: EquipmentType.LAPTOP,
            initialIssue: 'No enciende',
          },
          {
            equipmentType: EquipmentType.PRINTER,
            initialIssue: 'Atasco de papel',
          },
        ],
      },
      5,
    );

    expect(result.createdOrders).toHaveLength(2);
    expect(workflowService.getAssignmentSuggestion).toHaveBeenNthCalledWith(1, ServiceType.DIAGNOSIS, undefined);
    expect(workflowService.getAssignmentSuggestion).toHaveBeenNthCalledWith(2, ServiceType.DIAGNOSIS, manager as any);
    expect(workflowService.getAssignmentSuggestion).toHaveBeenNthCalledWith(3, ServiceType.DIAGNOSIS, manager as any);
  });

  it('dispatches the intake summary only after the batch transaction resolves', async () => {
    const callOrder: string[] = [];
    const firstOrder = createServiceOrder({
      id: 401,
      code: 'SO-BATCH-401',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const secondOrder = createServiceOrder({
      id: 402,
      code: 'SO-BATCH-402',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const transactionalServiceOrderRepository = createMockRepo<ServiceOrder>();
    const manager = createTransactionManager({ ServiceOrder: transactionalServiceOrderRepository });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    transactionalServiceOrderRepository.create.mockImplementation((value) => value);
    transactionalServiceOrderRepository.save
      .mockImplementationOnce(async (value) => ({ ...value, id: 401 }))
      .mockImplementationOnce(async (value) => ({ ...value, id: 402 }));
    transactionalServiceOrderRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(firstOrder)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(secondOrder);
    transactionalServiceOrderRepository.createQueryBuilder.mockReturnValue({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ code: 'SO-BATCH-401' }),
    });
    workflowService.registerInitialAssignment.mockImplementation(async () => {
      callOrder.push('assignment');
    });
    dataSource.transaction.mockImplementation(async (...args: any[]) => {
      const callback = args[args.length - 1] as (transactionManager: typeof manager) => Promise<unknown>;
      callOrder.push('transaction:start');
      const result = await callback(manager as any);
      callOrder.push('transaction:resolved');
      return result;
    });
    intakePdfService.generate.mockImplementation(async () => {
      callOrder.push('dispatch');
      return {
        fileName: 'resumen-ordenes.pdf',
        absolutePath: 'C:/tmp/resumen-ordenes.pdf',
        mimeType: 'application/pdf',
      };
    });

    const result = await service.createBatch(
      {
        sharedContext: {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
        },
        orders: [
          {
            equipmentType: EquipmentType.LAPTOP,
            initialIssue: 'No enciende',
          },
          {
            equipmentType: EquipmentType.PRINTER,
            initialIssue: 'Atasco de papel',
          },
        ],
      },
      5,
    );

    expect(result.createdOrders).toHaveLength(2);
    expect(callOrder).toEqual(['transaction:start', 'assignment', 'assignment', 'transaction:resolved', 'dispatch']);
    expect(messageMatrixService.dispatchOrderIntakeTemplate).toHaveBeenCalledTimes(1);
  });

  it('returns created orders even when post-commit intake generation fails', async () => {
    let transactionCompleted = false;
    const firstOrder = createServiceOrder({
      id: 451,
      code: 'SO-BATCH-451',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const secondOrder = createServiceOrder({
      id: 452,
      code: 'SO-BATCH-452',
      clientId: 30,
      clientSnapshotName: 'Carlos Avila',
      clientSnapshotPhone: '+51932998578',
      assignedTechnician: { id: 7, name: 'Carlos Rojas' } as any,
    });
    const transactionalServiceOrderRepository = createMockRepo<ServiceOrder>();
    const manager = createTransactionManager({ ServiceOrder: transactionalServiceOrderRepository });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue({ id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    transactionalServiceOrderRepository.create.mockImplementation((value) => value);
    transactionalServiceOrderRepository.save
      .mockImplementationOnce(async (value) => ({ ...value, id: 451 }))
      .mockImplementationOnce(async (value) => ({ ...value, id: 452 }));
    transactionalServiceOrderRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(firstOrder)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(secondOrder);
    transactionalServiceOrderRepository.createQueryBuilder.mockReturnValue({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ code: 'SO-BATCH-451' }),
    });
    dataSource.transaction.mockImplementation(async (...args: any[]) => {
      const callback = args[args.length - 1] as (transactionManager: typeof manager) => Promise<unknown>;
      const result = await callback(manager as any);
      transactionCompleted = true;
      return result;
    });
    intakePdfService.generate.mockImplementation(async () => {
      expect(transactionCompleted).toBe(true);
      throw new Error('pdf generation failed');
    });

    const result = await service.createBatch(
      {
        sharedContext: {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
        },
        orders: [
          {
            equipmentType: EquipmentType.LAPTOP,
            initialIssue: 'No enciende',
          },
          {
            equipmentType: EquipmentType.PRINTER,
            initialIssue: 'Atasco de papel',
          },
        ],
      },
      5,
    );

    expect(result.createdOrders).toEqual([firstOrder, secondOrder]);
    expect(transactionCompleted).toBe(true);
    expect(transactionalServiceOrderRepository.save).toHaveBeenCalledTimes(2);
    expect(tempDocumentsService.createRecord).not.toHaveBeenCalled();
    expect(messageMatrixService.dispatchOrderIntakeTemplate).not.toHaveBeenCalled();
  });

  it('rechaza batch sin ordenes candidatas', async () => {
    await expect(
      service.createBatch(
        {
          sharedContext: {
            requestOrigin: RequestOrigin.INTERNAL,
          },
          orders: [],
        },
        5,
      ),
    ).rejects.toThrow('At least one order is required');
  });

  it('prevalida todo el batch antes de persistir para evitar creaciones parciales', async () => {
    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.getAssignmentSuggestion
      .mockResolvedValueOnce({
        serviceType: ServiceType.DIAGNOSIS,
        suggestedTechnicianId: 7,
        technicians: [],
      })
      .mockRejectedValueOnce(new BadRequestException('No hay tecnicos disponibles para asignar ordenes'));

    await expect(
      service.createBatch(
        {
          sharedContext: {
            requestOrigin: RequestOrigin.INTERNAL,
          },
          orders: [
            {
              equipmentType: EquipmentType.LAPTOP,
              initialIssue: 'No enciende',
              serviceType: ServiceType.DIAGNOSIS,
            },
            {
              equipmentType: EquipmentType.PRINTER,
              initialIssue: 'Atasco de papel',
              serviceType: ServiceType.STANDARD_SERVICE,
            },
          ],
        },
        5,
      ),
    ).rejects.toThrow('No hay tecnicos disponibles para asignar ordenes');

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('retries service order persistence when the generated code collides during save', async () => {
    const created = createServiceOrder({
      id: 110,
      code: 'SO-TEST-RETRY-002',
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save
      .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062, message: 'Duplicate entry' })
      .mockImplementationOnce(async (value) => ({ ...value, id: 110 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest
      .spyOn(service as any, 'generateUniqueCode')
      .mockResolvedValueOnce('SO-TEST-RETRY-001')
      .mockResolvedValueOnce('SO-TEST-RETRY-002');

    const result = await service.create(
      {
        requestOrigin: RequestOrigin.INTERNAL,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Reintento por código duplicado',
      },
      5,
    );

    expect(result).toEqual(created);
    expect(serviceOrderRepository.save).toHaveBeenCalledTimes(2);
    expect(serviceOrderRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ code: 'SO-TEST-RETRY-001' }),
    );
    expect(serviceOrderRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ code: 'SO-TEST-RETRY-002' }),
    );
  });

  it('throws after bounded duplicate-code retries during persistence', async () => {
    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockRejectedValue({
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      message: 'Duplicate entry',
    });
    jest
      .spyOn(service as any, 'generateUniqueCode')
      .mockResolvedValueOnce('SO-TEST-RETRY-001')
      .mockResolvedValueOnce('SO-TEST-RETRY-002')
      .mockResolvedValueOnce('SO-TEST-RETRY-003');

    await expect(
      service.create(
        {
          requestOrigin: RequestOrigin.INTERNAL,
          equipmentType: EquipmentType.LAPTOP,
          initialIssue: 'Conflicto persistente de código',
        },
        5,
      ),
    ).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      message: 'Duplicate entry',
    });

    expect(serviceOrderRepository.save).toHaveBeenCalledTimes(3);
    expect(workflowService.registerInitialAssignment).not.toHaveBeenCalled();
  });

  it('crea la orden con los ejes canónicos iniciales', async () => {
    const created = createServiceOrder({
      id: 99,
      code: 'SO-TEST-001',
      technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      serviceType: ServiceType.STANDARD_SERVICE,
      assignedToTechnicianId: 7,
      assignedAt: new Date('2026-01-01T10:00:00.000Z'),
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.ensureTechnicianAvailable.mockResolvedValue({ id: 7 } as User);
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 99 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-001');

    await service.create(
      {
        requestOrigin: RequestOrigin.INTERNAL,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Requiere mantenimiento',
        serviceType: ServiceType.STANDARD_SERVICE,
        assignedToTechnicianId: 7,
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operativeStatus: ServiceOrderOperativeStatus.ABIERTA,
        technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
        commercialStatus: ServiceOrderCommercialStatus.NO_REQUIERE,
        economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
        montoComprometidoVigente: 0,
        montoReconciliado: 0,
      }),
    );
    expect(workflowService.registerInitialAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99 }),
      5,
      undefined,
    );
  });

  it('persiste datos de contacto en el snapshot al crear la orden', async () => {
    const created = createServiceOrder({
      id: 100,
      code: 'SO-TEST-002',
      clientSnapshotName: 'Contacto Manual',
      clientSnapshotEmail: 'contacto@test.com',
      clientSnapshotPhone: '+51999999999',
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 100 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-002');

    await service.create(
      {
        requestOrigin: RequestOrigin.INTERNAL,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Revisión preventiva',
        serviceType: ServiceType.DIAGNOSIS,
        contactName: 'Contacto Manual',
        contactEmail: 'contacto@test.com',
        contactPhone: '+51 999 999 999',
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientContactId: null,
        clientSnapshotName: 'Contacto Manual',
        clientSnapshotEmail: 'contacto@test.com',
        clientSnapshotPhone: '+51999999999',
      }),
    );
  });

  it('usa clientContactId y snapshot del contacto al crear orden para empresa', async () => {
    const client = { id: 30, kind: 'COMPANY', documentType: { name: 'RUC' } } as any;
    const contact = { id: 88, clientId: 30, name: 'Ana Contacto', email: 'ana@corp.com', phone: '+51900111222', isPrimary: true, isActive: true };
    const created = createServiceOrder({
      id: 101,
      clientId: 30,
      clientContactId: 88,
      clientSnapshotName: 'Ana Contacto',
      clientSnapshotEmail: 'ana@corp.com',
      clientSnapshotPhone: '+51900111222',
    });

    userRepository.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepository.findOne.mockResolvedValue(client);
    clientContactRepository.findOne.mockResolvedValue(contact as any);
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      serviceType: ServiceType.DIAGNOSIS,
      suggestedTechnicianId: 7,
      technicians: [],
    });
    serviceOrderRepository.create.mockImplementation((value) => value);
    serviceOrderRepository.save.mockImplementation(async (value) => ({ ...value, id: 101 }));
    serviceOrderRepository.findOne.mockResolvedValue(created);
    jest.spyOn(service as any, 'generateUniqueCode').mockResolvedValue('SO-TEST-003');

    await service.create(
      {
        requestOrigin: RequestOrigin.CLIENT,
        clientId: 30,
        clientContactId: 88,
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'Empresa',
        serviceType: ServiceType.DIAGNOSIS,
      },
      5,
    );

    expect(serviceOrderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 30,
        clientContactId: 88,
        clientSnapshotName: 'Ana Contacto',
        clientSnapshotEmail: 'ana@corp.com',
        clientSnapshotPhone: '+51900111222',
      }),
    );
  });

  it('al marcar como entregada asigna deliveredAt y notifica encuesta', async () => {
    const order = createServiceOrder({ deliveredAt: null, operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    eventRepository.create.mockImplementation((value) => value);

    const result = await service.markAsDelivered(order.id, 77);

    expect(result.deliveredAt).toBeInstanceOf(Date);
    expect(eventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: order.id,
        eventType: 'operative.delivered',
        axis: 'operativo',
        capability: 'delivery',
        fromStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
        toStatus: ServiceOrderOperativeStatus.ENTREGADA,
        actorId: 77,
      }),
    );
    expect(messageMatrixService.notifySurveyRequest).toHaveBeenCalledWith(result);
  });

  it('bloquea la entrega si el acuerdo vigente no está totalmente cubierto', async () => {
    const order = createServiceOrder({
      operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
      montoComprometidoVigente: 120,
      montoReconciliado: 80,
      economicStatus: ServiceOrderEconomicStatus.PARCIAL,
    });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(service.markAsDelivered(order.id, 77)).rejects.toThrow(
      'La orden no puede entregarse hasta cubrir totalmente su cotización vigente',
    );
  });

  it('enriquece findOne con métricas globales sin prioridad de cabecera', async () => {
    const order = createServiceOrder({ technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    const result = await service.findOne(order.id);

    expect(metricsFactory.build).toHaveBeenCalledWith(order);
    expect(result.timeMetrics.timeToService.valueMinutes).toBe(150);
  });

  it('no pisa deliveredAt existente al volver a marcar una orden entregada', async () => {
    const deliveredAt = new Date('2026-01-03T12:00:00.000Z');
    const order = createServiceOrder({ deliveredAt, operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockImplementation(async (entity) => entity);
    eventRepository.create.mockImplementation((value) => value);

    const result = await service.markAsDelivered(order.id);

    expect(result.deliveredAt).toBe(deliveredAt);
    expect(messageMatrixService.notifySurveyRequest).toHaveBeenCalledWith(result);
  });

  it('rechaza update sobre orden soft-deleted', async () => {
    serviceOrderRepository.findOne.mockResolvedValue(null);

    await expect(service.update(55, { notes: 'forbidden' } as any)).rejects.toThrow(NotFoundException);
    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza la mutación directa de operativeStatus desde update', async () => {
    const order = createServiceOrder({ operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.update(order.id, { operativeStatus: ServiceOrderOperativeStatus.ENTREGADA } as any),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza la mutación directa de serviceType desde update', async () => {
    const order = createServiceOrder({ serviceType: ServiceType.DIAGNOSIS });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.update(order.id, { serviceType: ServiceType.STANDARD_SERVICE } as any),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza la mutación directa de assignedToTechnicianId desde update', async () => {
    const order = createServiceOrder({ assignedToTechnicianId: 4 });
    serviceOrderRepository.findOne.mockResolvedValue(order);

    await expect(
      service.update(order.id, { assignedToTechnicianId: 12 } as any),
    ).rejects.toThrow(BadRequestException);

    expect(serviceOrderRepository.save).not.toHaveBeenCalled();
  });

  it('resincroniza el telefono del hilo cuando cambia el contacto de la orden', async () => {
    const order = createServiceOrder({ clientSnapshotPhone: '+51999111222' });
    const updated = createServiceOrder({ clientSnapshotPhone: '+51988777666' });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockResolvedValue(updated);

    await service.update(order.id, { contactPhone: '+51 988 777 666' });

    expect(inboxService.syncThreadClientPhoneSnapshotForOrder).toHaveBeenCalledWith(order.id, '+51988777666');
  });

  it('no toca el hilo si el telefono canonico no cambió', async () => {
    const order = createServiceOrder({ clientSnapshotPhone: '+51999111222' });
    const updated = createServiceOrder({ clientSnapshotPhone: '+51999111222' });
    serviceOrderRepository.findOne.mockResolvedValue(order);
    serviceOrderRepository.save.mockResolvedValue(updated);

    await service.update(order.id, { contactPhone: '+51 999 111 222' });

    expect(inboxService.syncThreadClientPhoneSnapshotForOrder).not.toHaveBeenCalled();
  });

  it('aplica filtros canónicos al listado cuando se consultan estados', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll({
      page: 1,
      limit: 10,
      operativeStatus: ServiceOrderOperativeStatus.ENTREGADA,
      technicalStatus: ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
      commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
      economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.operativeStatus IN (:...operativeStatuses)', {
      operativeStatuses: [ServiceOrderOperativeStatus.ENTREGADA],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.technicalStatus IN (:...technicalStatuses)', {
      technicalStatuses: [ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.commercialStatus IN (:...commercialStatuses)', {
      commercialStatuses: [ServiceOrderCommercialStatus.AUTORIZADA],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('serviceOrder.economicStatus IN (:...economicStatuses)', {
      economicStatuses: [ServiceOrderEconomicStatus.PENDIENTE],
    });
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('serviceOrder.items', 'items');
  });

  it('devuelve un resumen de equipos en cada cabecera listada', async () => {
    const order = createServiceOrder({
      items: [
        {
          id: 12,
          position: 2,
          code: 'SO-02-08-2026-0001-02',
          technicalStatus: ServiceOrderTechnicalStatus.EN_EJECUCION,
          operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
        },
        {
          id: 11,
          position: 1,
          code: 'SO-02-08-2026-0001-01',
          technicalStatus: ServiceOrderTechnicalStatus.RESUELTA,
          operativeStatus: ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA,
        },
      ] as ServiceOrderItem[],
    });
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[order], 1]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data[0].itemsCount).toBe(2);
    expect(result.data[0].itemCodes).toEqual([
      'SO-02-08-2026-0001-01',
      'SO-02-08-2026-0001-02',
    ]);
    expect(result.data[0].itemProgress).toEqual(
      expect.objectContaining({ total: 2, resolved: 1, readyForPickup: 1, isPartial: true }),
    );
  });

  it('genera un solo PDF con todos los equipos del detalle', async () => {
    serviceOrderRepository.findOne.mockResolvedValue(
      createServiceOrder({
        code: 'SO-02-08-2026-0001',
        items: [
          {
            id: 12,
            position: 2,
            code: 'SO-02-08-2026-0001-02',
            priority: ServiceOrderPriority.HIGH,
            equipmentType: EquipmentType.PRINTER,
            initialIssue: 'Atasca papel',
          },
          {
            id: 11,
            position: 1,
            code: 'SO-02-08-2026-0001-01',
            priority: ServiceOrderPriority.LOW,
            equipmentType: EquipmentType.LAPTOP,
            initialIssue: 'No enciende',
          },
        ] as ServiceOrderItem[],
      }),
    );

    const result = await service.generateSingleOrderSummaryPdf(1);

    expect(result.fileName).toBe('SO-02-08-2026-0001-resumen.pdf');
    expect(intakePdfService.generateSingleOrderSummaryBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SO-02-08-2026-0001',
        items: [
          expect.objectContaining({ code: 'SO-02-08-2026-0001-01' }),
          expect.objectContaining({ code: 'SO-02-08-2026-0001-02' }),
        ],
      }),
    );
    expect(serviceOrderRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ relations: expect.arrayContaining(['items']) }),
    );
  });

  it('acota el listado para técnicos a sus órdenes asignadas', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll({ page: 1, limit: 10 }, { sub: 44, roles: [{ name: 'technician' }] } as any);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'serviceOrder.assignedToTechnicianId = :viewerTechnicianId',
      { viewerTechnicianId: 44 },
    );
  });

  it('no acota el listado para admin con rol técnico adicional', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll(
      { page: 1, limit: 10 },
      { sub: 44, roles: [{ name: 'admin' }, { name: 'technician' }] } as any,
    );

    expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
      'serviceOrder.assignedToTechnicianId = :viewerTechnicianId',
      { viewerTechnicianId: 44 },
    );
  });

  it('impide que un técnico lea órdenes ajenas', async () => {
    serviceOrderRepository.findOne.mockResolvedValue(createServiceOrder({ assignedToTechnicianId: 7 }));

    await expect(
      service.findOne(1, false, { sub: 9, roles: [{ name: 'technician' }] } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite que recepción con rol técnico adicional lea órdenes ajenas', async () => {
    serviceOrderRepository.findOne.mockResolvedValue(createServiceOrder({ assignedToTechnicianId: 7 }));

    await expect(
      service.findOne(1, false, { sub: 9, roles: [{ name: 'recepcionist' }, { name: 'technician' }] } as any),
    ).resolves.toBeDefined();
  });

  it('enriquece findAll con sla y timeMetrics por cada fila', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[createServiceOrder()], 1]),
    };
    serviceOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(metricsFactory.build).toHaveBeenCalledTimes(1);
    expect(result.data[0].timeMetrics.timeToDiagnosis.valueMinutes).toBe(120);
  });
});
