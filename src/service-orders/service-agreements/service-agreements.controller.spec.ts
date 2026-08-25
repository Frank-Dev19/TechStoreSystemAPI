import { ServiceOrderAgreementsController } from './service-agreements.controller';
import { ServiceOrderAgreementsService } from './service-agreements.service';
import { ServiceOrderCommercialRevisionService } from './service-order-commercial-revision.service';
import { ServiceOrderCommercialDecisionService } from './service-order-commercial-decision.service';
import { ServiceOrderCommercialIssuanceService } from './service-order-commercial-issuance.service';

describe('ServiceOrderAgreementsController', () => {
  let controller: ServiceOrderAgreementsController;
  let service: jest.Mocked<ServiceOrderAgreementsService>;
  let revisionService: jest.Mocked<ServiceOrderCommercialRevisionService>;
  let decisionService: jest.Mocked<ServiceOrderCommercialDecisionService>;
  let issuanceService: jest.Mocked<ServiceOrderCommercialIssuanceService>;

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

    revisionService = {
      createRevision: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderCommercialRevisionService>;

    decisionService = {
      recordDecision: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderCommercialDecisionService>;
    issuanceService = {
      preview: jest.fn(),
      issue: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderCommercialIssuanceService>;

    controller = new ServiceOrderAgreementsController(
      service,
      revisionService,
      decisionService,
      issuanceService,
    );
  });

  it('delegates list query as-is', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0 } as any);

    await controller.findAll({ page: 2, status: 'CONFIRMED' });

    expect(service.findAll).toHaveBeenCalledWith({ page: 2, status: 'CONFIRMED' });
  });

  it('delega la revisión consolidada con el usuario autenticado', async () => {
    revisionService.createRevision.mockResolvedValue({ id: 90 } as any);
    const dto = { serviceOrderId: 10, items: [{ serviceOrderItemId: 101, lines: [] }] } as any;

    await controller.createRevision(dto, { user: { sub: 9, roles: [{ name: 'technician' }] } });

    expect(revisionService.createRevision).toHaveBeenCalledWith(dto, {
      sub: 9,
      roles: [{ name: 'technician' }],
    });
  });

  it('delega la decisión del cliente con el usuario autenticado', async () => {
    decisionService.recordDecision.mockResolvedValue({ allAccepted: false } as any);
    const dto = { commercialVersionId: 801, decision: 'ACCEPTED', channel: 'WHATSAPP' } as any;

    await controller.recordClientDecision(dto, { user: { sub: 21, roles: [{ name: 'recepcionist' }] } });

    expect(decisionService.recordDecision).toHaveBeenCalledWith(dto, {
      sub: 21,
      roles: [{ name: 'recepcionist' }],
    });
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

  it('delegates the derived create/update contract unchanged', async () => {
    service.create.mockResolvedValue({ id: 12 } as any);
    service.update.mockResolvedValue({ id: 12 } as any);

    await controller.create({ serviceOrderId: 10, diagnosisId: 91, baseAgreementId: 44 } as any);
    await controller.update(12, {
      notes: 'Nueva versión',
      technicalServiceAmount: 95,
      newProducts: [{ productId: 7, quantity: 1, unitPrice: 55 }],
    } as any);

    expect(service.create).toHaveBeenCalledWith({ serviceOrderId: 10, diagnosisId: 91, baseAgreementId: 44 });
    expect(service.update).toHaveBeenCalledWith(12, {
      notes: 'Nueva versión',
      technicalServiceAmount: 95,
      newProducts: [{ productId: 7, quantity: 1, unitPrice: 55 }],
    });
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
