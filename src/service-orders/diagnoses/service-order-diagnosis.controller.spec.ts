import { ServiceOrderDiagnosisController } from './service-order-diagnosis.controller';
import { ServiceOrderDiagnosisService } from './service-order-diagnosis.service';

describe('ServiceOrderDiagnosisController', () => {
  let controller: ServiceOrderDiagnosisController;
  let service: jest.Mocked<ServiceOrderDiagnosisService>;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      bulkSoftDelete: jest.fn(),
      bulkRestore: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderDiagnosisService>;

    controller = new ServiceOrderDiagnosisController(service);
  });

  it('delegates listing with filters', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0 } as any);

    await controller.findAll({ page: 1, serviceOrderId: 15 });

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, serviceOrderId: 15 });
  });

  it('interprets withDeleted flag only when true', async () => {
    service.findOne.mockResolvedValue({ id: 3 } as any);

    await controller.findOne(3, 'true');
    await controller.findOne(3, undefined);

    expect(service.findOne).toHaveBeenNthCalledWith(1, 3, true);
    expect(service.findOne).toHaveBeenNthCalledWith(2, 3, false);
  });

  it('delegates create and update', async () => {
    service.create.mockResolvedValue({ id: 12 } as any);
    service.update.mockResolvedValue({ id: 12 } as any);

    await controller.create({ serviceOrderId: 8, diagnosticSummary: 'placa dañada' } as any);
    await controller.update(12, { recommendedSolution: 'cambio de placa' } as any);

    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ serviceOrderId: 8 }));
    expect(service.update).toHaveBeenCalledWith(12, expect.objectContaining({ recommendedSolution: 'cambio de placa' }));
  });

  it('delegates delete and restore endpoints', async () => {
    service.softDelete.mockResolvedValue({ ok: true } as any);
    service.restore.mockResolvedValue({ ok: true } as any);

    await controller.remove(4);
    await controller.restore(4);

    expect(service.softDelete).toHaveBeenCalledWith(4);
    expect(service.restore).toHaveBeenCalledWith(4);
  });

  it('delegates bulk delete and restore with dto ids', async () => {
    service.bulkSoftDelete.mockResolvedValue({ affected: 2 } as any);
    service.bulkRestore.mockResolvedValue({ affected: 2 } as any);

    await controller.bulkDelete({ ids: [9, 10] });
    await controller.bulkRestore({ ids: [9, 10] });

    expect(service.bulkSoftDelete).toHaveBeenCalledWith([9, 10]);
    expect(service.bulkRestore).toHaveBeenCalledWith([9, 10]);
  });
});
