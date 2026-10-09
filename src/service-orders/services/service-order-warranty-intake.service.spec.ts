import {
  ServiceOrderEconomicStatus,
  ServiceType,
  EquipmentType,
} from '../enums';
import { WarrantySourceType } from '../../warranties/enums/warranty-source-type.enum';
import { ServiceOrderWarrantyIntakeService } from './service-order-warranty-intake.service';
import { WarrantyResponsibility } from '../../warranties/enums/warranty-responsibility.enum';
import { WarrantyDurationUnit } from '../../common/enums/warranty-duration-unit.enum';

describe('ServiceOrderWarrantyIntakeService', () => {
  const manager = {
    getRepository: jest.fn(() => ({ save: jest.fn(async (value) => value) })),
  } as any;
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  } as any;
  const warrantiesService = {
    createExternalProductCoverage: jest.fn(),
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
      manager,
      40,
      80,
      801,
      12,
      undefined,
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
    workflowService.getAssignmentSuggestion.mockResolvedValue({
      suggestedTechnicianId: 16,
    });

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

  it('crea cobertura externa y orden de garantía en la misma transacción', async () => {
    warrantiesService.createExternalProductCoverage.mockResolvedValue({
      id: 70,
    });
    warrantiesService.reserveCoverage.mockResolvedValue({
      coverage: { id: 70 },
      claim: { id: 71 },
    });

    const result = await service.createExternal(
      {
        companyId: 1,
        clientId: 4,
        assignedToTechnicianId: 16,
        externalDocumentType: 'BOLETA',
        externalDocumentSeries: 'B001',
        externalDocumentNumber: '100',
        externalDocumentDate: '2026-09-30',
        productDescription: 'Mouse Logitech',
        responsibility: WarrantyResponsibility.STORE,
        durationValue: 30,
        durationUnit: WarrantyDurationUnit.DAY,
        coverageAmount: 50,
        equipmentType: EquipmentType.OTHER,
        reportedIssue: 'No funciona el clic derecho',
      },
      { sub: 5, roles: [{ id: 2, name: 'recepcionist' }] },
    );

    expect(
      warrantiesService.createExternalProductCoverage,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ documentSeries: 'B001', actorId: 5 }),
    );
    expect(warrantiesService.reserveCoverage).toHaveBeenCalledWith(
      manager,
      70,
      'No funciona el clic derecho',
      5,
    );
    expect(warrantiesService.linkClaimToOrder).toHaveBeenCalledWith(
      manager,
      71,
      80,
      801,
      16,
    );
    expect(result.economicStatus).toBe(ServiceOrderEconomicStatus.EXONERADO);
  });
});
