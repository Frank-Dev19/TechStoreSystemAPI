import { ServiceOrderEconomicStatus, ServiceType, EquipmentType } from '../enums';
import { WarrantySourceType } from '../../warranties/enums/warranty-source-type.enum';
import { ServiceOrderWarrantyIntakeService } from './service-order-warranty-intake.service';

describe('ServiceOrderWarrantyIntakeService', () => {
  const manager = {
    getRepository: jest.fn(() => ({ save: jest.fn(async (value) => value) })),
  } as any;
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  } as any;
  const warrantiesService = {
    reserveCoverage: jest.fn(),
    linkClaimToOrder: jest.fn(),
  } as any;
  const aggregateService = {
    createInTransaction: jest.fn(),
    notifyCreated: jest.fn(),
  } as any;
  const workflowService = {
    getAssignmentSuggestion: jest.fn(),
  } as any;

  let service: ServiceOrderWarrantyIntakeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceOrderWarrantyIntakeService(
      dataSource,
      warrantiesService,
      aggregateService,
      workflowService,
    );
    aggregateService.createInTransaction.mockResolvedValue({
      id: 80,
      items: [{ id: 801 }],
      economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
    });
  });

  it('mantiene al técnico original en una garantía de servicio y deja la orden exonerada', async () => {
    warrantiesService.reserveCoverage.mockResolvedValue({
      claim: { id: 40 },
      coverage: {
        sourceType: WarrantySourceType.SERVICE,
        customerId: 3,
        originTechnicianId: 12,
        serviceOrderItemId: 25,
        sourceNameSnapshot: 'Lenovo ThinkPad',
        serialSnapshot: 'ABC-1',
        product: null,
        serviceOrderItem: {
          id: 25,
          equipmentType: EquipmentType.LAPTOP,
          brand: 'Lenovo',
          model: 'ThinkPad',
          serialNumber: 'ABC-1',
          accessories: 'Cargador',
        },
      },
    });

    const result = await service.create(
      { coverageId: 7, reportedIssue: 'La falla continúa' },
      { sub: 5, roles: [{ id: 2, name: 'recepcionist' }] },
    );

    expect(aggregateService.createInTransaction).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        serviceType: ServiceType.WARRANTY_SERVICE,
        assignedToTechnicianId: 12,
      }),
      5,
    );
    expect(warrantiesService.linkClaimToOrder).toHaveBeenCalledWith(
      manager, 40, 80, 801, 12, undefined,
    );
    expect(result.economicStatus).toBe(ServiceOrderEconomicStatus.EXONERADO);
    expect(aggregateService.notifyCreated).toHaveBeenCalledWith(result);
  });

  it('asigna una garantía de producto mediante el balance normal de técnicos', async () => {
    warrantiesService.reserveCoverage.mockResolvedValue({
      claim: { id: 41 },
      coverage: {
        sourceType: WarrantySourceType.PRODUCT,
        customerId: 4,
        originTechnicianId: null,
        serviceOrderItemId: null,
        sourceNameSnapshot: 'Memoria RAM',
        serialSnapshot: null,
        product: { brand: 'Kingston' },
        serviceOrderItem: null,
      },
    });
    workflowService.getAssignmentSuggestion.mockResolvedValue({ suggestedTechnicianId: 16 });

    await service.create(
      {
        coverageId: 8,
        reportedIssue: 'El producto no enciende',
        equipmentType: EquipmentType.OTHER,
        equipmentTypeOther: 'Componente',
      },
      { sub: 5, roles: [{ id: 2, name: 'recepcionist' }] },
    );

    expect(workflowService.getAssignmentSuggestion).toHaveBeenCalledWith(
      ServiceType.WARRANTY_SERVICE,
      manager,
    );
    expect(aggregateService.createInTransaction).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ assignedToTechnicianId: 16 }),
      5,
    );
  });
});
