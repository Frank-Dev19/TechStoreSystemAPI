import { DataSource, EntityManager } from 'typeorm';
import { ClientContact } from '../../clients/entities/client-contact.entity';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { EquipmentType, RequestOrigin, ServiceOrderPriority, ServiceType } from '../enums';
import { ServiceOrderCodeService } from './service-order-code.service';
import { ServiceOrderAggregateService } from './service-order-aggregate.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';
import { ServiceOrderInitialCommercialService } from './service-order-initial-commercial.service';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';
import { ServiceOrderIntakeNotificationService } from './service-order-intake-notification.service';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
};

const createRepo = (): MockRepo => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  findOne: jest.fn(),
});

describe('ServiceOrderAggregateService', () => {
  let service: ServiceOrderAggregateService;
  let dataSource: jest.Mocked<DataSource>;
  let manager: jest.Mocked<EntityManager>;
  let orderRepo: MockRepo;
  let itemRepo: MockRepo;
  let clientRepo: MockRepo;
  let contactRepo: MockRepo;
  let userRepo: MockRepo;
  let codeService: jest.Mocked<ServiceOrderCodeService>;
  let workflowService: jest.Mocked<ServiceOrderWorkflowService>;
  let initialCommercialService: jest.Mocked<ServiceOrderInitialCommercialService>;
  let intakeNotificationService: jest.Mocked<ServiceOrderIntakeNotificationService>;

  beforeEach(() => {
    orderRepo = createRepo();
    itemRepo = createRepo();
    clientRepo = createRepo();
    contactRepo = createRepo();
    userRepo = createRepo();

    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === ServiceOrder) return orderRepo;
        if (entity === ServiceOrderItem) return itemRepo;
        if (entity === Client) return clientRepo;
        if (entity === ClientContact) return contactRepo;
        if (entity === User) return userRepo;
        throw new Error(`Repositorio inesperado: ${entity?.name}`);
      }),
    } as unknown as jest.Mocked<EntityManager>;
    dataSource = {
      transaction: jest.fn(async (callback: (transactionManager: EntityManager) => unknown) => callback(manager)),
    } as unknown as jest.Mocked<DataSource>;
    codeService = {
      allocate: jest.fn().mockResolvedValue({
        parentCode: 'SO-02-08-2026-0001',
        itemCodes: ['SO-02-08-2026-0001-01', 'SO-02-08-2026-0001-02'],
        businessDate: '2026-08-02',
        sequenceNumber: 1,
      }),
    } as unknown as jest.Mocked<ServiceOrderCodeService>;
    workflowService = {
      ensureTechnicianAvailable: jest.fn(),
      registerInitialAssignment: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderWorkflowService>;
    initialCommercialService = {
      createForDirectService: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderInitialCommercialService>;
    intakeNotificationService = {
      notifyOrders: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderIntakeNotificationService>;

    service = new ServiceOrderAggregateService(
      dataSource,
      codeService,
      workflowService,
      initialCommercialService,
      intakeNotificationService,
    );
  });

  it('crea una cabecera y varios equipos en una sola transacción', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepo.findOne.mockResolvedValue({
      id: 30,
      kind: 'PERSON',
      name: 'Sergio Ávila',
      documentNumber: '12345678',
      documentType: { name: 'DNI' },
      phone: '+51932998578',
      email: 'sergio@example.com',
    });
    orderRepo.save.mockImplementation(async (value) => ({ ...value, id: 100 }));
    itemRepo.save.mockImplementation(async (value) => value.map((item: any, index: number) => ({ ...item, id: index + 1 })));
    orderRepo.findOne.mockResolvedValue({ id: 100, code: 'SO-02-08-2026-0001', items: [{ id: 1 }, { id: 2 }] });

    const result = await service.create(
      {
        requestOrigin: RequestOrigin.CLIENT,
        clientId: 30,
        assignedToTechnicianId: 7,
        serviceType: ServiceType.DIAGNOSIS,
        items: [
          { equipmentType: EquipmentType.LAPTOP, initialIssue: 'No enciende', priority: ServiceOrderPriority.HIGH },
          { equipmentType: EquipmentType.PRINTER, initialIssue: 'Atasca papel', priority: ServiceOrderPriority.LOW },
        ],
      },
      5,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(codeService.allocate).toHaveBeenCalledWith(manager, 2);
    expect(orderRepo.save).toHaveBeenCalledTimes(1);
    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SO-02-08-2026-0001',
        serviceType: ServiceType.DIAGNOSIS,
        assignedToTechnicianId: 7,
      }),
    );
    expect(orderRepo.create.mock.calls[0][0]).not.toHaveProperty('priority');
    expect(itemRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        serviceOrderId: 100,
        code: 'SO-02-08-2026-0001-01',
        priority: ServiceOrderPriority.HIGH,
      }),
      expect.objectContaining({
        serviceOrderId: 100,
        code: 'SO-02-08-2026-0001-02',
        priority: ServiceOrderPriority.LOW,
      }),
    ]);
    expect(workflowService.registerInitialAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 100 }),
      5,
      manager,
    );
    expect(result.items).toHaveLength(2);
    expect(initialCommercialService.createForDirectService).not.toHaveBeenCalled();
    expect(intakeNotificationService.notifyOrders).toHaveBeenCalledWith([result]);
  });

  it('propaga el fallo de un equipo para que la transacción se revierta', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepo.findOne.mockResolvedValue({ id: 30, kind: 'PERSON', documentType: { name: 'DNI' } });
    orderRepo.save.mockResolvedValue({ id: 100 });
    itemRepo.save.mockRejectedValue(new Error('item write failed'));

    await expect(
      service.create(
        {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
          assignedToTechnicianId: 7,
          serviceType: ServiceType.DIAGNOSIS,
          items: [{ equipmentType: EquipmentType.LAPTOP, initialIssue: 'No enciende' }],
        },
        5,
      ),
    ).rejects.toThrow('item write failed');

    expect(workflowService.registerInitialAssignment).not.toHaveBeenCalled();
    expect(intakeNotificationService.notifyOrders).not.toHaveBeenCalled();
  });

  it('guarda los comerciales iniciales directos dentro de la misma transacción', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepo.findOne.mockResolvedValue({ id: 30, kind: 'PERSON', documentType: { name: 'DNI' } });
    orderRepo.save.mockImplementation(async (value) => ({ ...value, id: 100 }));
    itemRepo.save.mockImplementation(async (value) => value.map((item: any, index: number) => ({ ...item, id: index + 1 })));
    orderRepo.findOne.mockResolvedValue({ id: 100, items: [{ id: 1 }] });

    const dto = {
      requestOrigin: RequestOrigin.CLIENT,
      clientId: 30,
      assignedToTechnicianId: 7,
      serviceType: ServiceType.STANDARD_SERVICE,
      items: [
        {
          equipmentType: EquipmentType.LAPTOP,
          initialIssue: 'Mantenimiento preventivo',
          initialCommercial: {
            lines: [{ type: ServiceOrderCommercialLineType.SERVICE, quantity: 1, unitPrice: 80 }],
          },
        },
      ],
    };

    await service.create(dto, 5);

    expect(initialCommercialService.createForDirectService).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ id: 100 }),
      expect.arrayContaining([expect.objectContaining({ id: 1 })]),
      dto.items,
      5,
    );
    expect(itemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        technicalStatus: 'AUTORIZADA_PARA_EJECUCION',
        commercialStatus: 'AUTORIZADA',
      }),
    );
  });

  it('propaga el fallo comercial para revertir también cabecera y equipos', async () => {
    userRepo.findOne.mockResolvedValue({ id: 5, deletedAt: null });
    clientRepo.findOne.mockResolvedValue({ id: 30, kind: 'PERSON', documentType: { name: 'DNI' } });
    orderRepo.save.mockImplementation(async (value) => ({ ...value, id: 100 }));
    itemRepo.save.mockImplementation(async (value) => value.map((item: any, index: number) => ({ ...item, id: index + 1 })));
    initialCommercialService.createForDirectService.mockRejectedValue(new Error('commercial write failed'));

    await expect(
      service.create(
        {
          requestOrigin: RequestOrigin.CLIENT,
          clientId: 30,
          assignedToTechnicianId: 7,
          serviceType: ServiceType.STANDARD_SERVICE,
          items: [
            {
              equipmentType: EquipmentType.LAPTOP,
              initialIssue: 'Mantenimiento',
              initialCommercial: {
                lines: [{ type: ServiceOrderCommercialLineType.SERVICE, quantity: 1, unitPrice: 80 }],
              },
            },
          ],
        },
        5,
      ),
    ).rejects.toThrow('commercial write failed');

    expect(workflowService.registerInitialAssignment).not.toHaveBeenCalled();
  });

  it('impide crear una orden de garantía fuera del flujo de coberturas', async () => {
    await expect(service.create({
      requestOrigin: RequestOrigin.CLIENT,
      clientId: 30,
      assignedToTechnicianId: 7,
      serviceType: ServiceType.WARRANTY_SERVICE,
      items: [{ equipmentType: EquipmentType.LAPTOP, initialIssue: 'Falla recurrente' }],
    }, 5)).rejects.toThrow('Las órdenes de garantía deben crearse desde una cobertura vigente');

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
