import { ServiceOrderAgreementsController } from './service-agreements.controller';
import { ServiceOrderAgreementsService } from './service-agreements.service';

describe('ServiceOrderAgreementsController', () => {
  let controller: ServiceOrderAgreementsController;
  let service: jest.Mocked<ServiceOrderAgreementsService>;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      getTechnicianRevenueRankings: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      confirm: jest.fn(),
      void: jest.fn(),
      createDiagnosisFeeAgreement: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      bulkSoftDelete: jest.fn(),
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderAgreementsService>;

    controller = new ServiceOrderAgreementsController(service);
  });

  it('delegates list query as-is', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0 } as any);

    await controller.findAll({ page: 2, status: 'CONFIRMED' });

    expect(service.findAll).toHaveBeenCalledWith({ page: 2, status: 'CONFIRMED' });
  });

  it('interprets withDeleted flag only when true', async () => {
    service.findOne.mockResolvedValue({ id: 5 } as any);

    await controller.findOne(5, 'true');
    await controller.findOne(5, 'false');

    expect(service.findOne).toHaveBeenNthCalledWith(1, 5, true);
    expect(service.findOne).toHaveBeenNthCalledWith(2, 5, false);
  });

  it('delegates confirm and void endpoints', async () => {
    service.confirm.mockResolvedValue({ id: 9 } as any);
    service.void.mockResolvedValue({ id: 9 } as any);

    await controller.confirm(9);
    await controller.voidAgreement(9, 'cliente rechazó');

    expect(service.confirm).toHaveBeenCalledWith(9);
    expect(service.void).toHaveBeenCalledWith(9, 'cliente rechazó');
  });

  it('delegates diagnosis-fee-auto endpoint with parsed serviceOrderId', async () => {
    service.createDiagnosisFeeAgreement.mockResolvedValue({ id: 88 } as any);

    await controller.createDiagnosisFeeAgreement(77);

    expect(service.createDiagnosisFeeAgreement).toHaveBeenCalledWith(77);
  });

  it('delegates bulk delete and restore with dto ids', async () => {
    service.bulkSoftDelete.mockResolvedValue({ affected: 2 } as any);
    service.bulkRestore.mockResolvedValue({ affected: 2 } as any);

    await controller.bulkDelete({ ids: [1, 2] });
    await controller.bulkRestore({ ids: [1, 2] });

    expect(service.bulkSoftDelete).toHaveBeenCalledWith([1, 2]);
    expect(service.bulkRestore).toHaveBeenCalledWith([1, 2]);
  });
});
