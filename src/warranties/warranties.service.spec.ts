/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { ServiceOrderDiagnosisOutcome } from '../service-orders/diagnoses/service-order-diagnosis-outcome.enum';
import { ServiceOrderDiagnosis } from '../service-orders/diagnoses/entities/service-order-diagnosis.entity';
import { WarrantyClaim } from './entities/warranty-claim.entity';
import { WarrantyCoverage } from './entities/warranty-coverage.entity';
import { WarrantyMovement } from './entities/warranty-movement.entity';
import { WarrantyClaimStatus } from './enums/warranty-claim-status.enum';
import { WarrantyCoverageStatus } from './enums/warranty-coverage-status.enum';
import { WarrantyMovementType } from './enums/warranty-movement-type.enum';
import { WarrantySourceType } from './enums/warranty-source-type.enum';
import { WarrantiesService } from './warranties.service';

const repository = () => ({
  findOne: jest.fn(),
  save: jest.fn((value) => Promise.resolve(value)),
  create: jest.fn((value) => value),
});

describe('WarrantiesService', () => {
  it('agrupa las coberturas de una venta por producto sin perder sus unidades', () => {
    const service = new WarrantiesService(
      repository() as any,
      repository() as any,
      repository() as any,
    );
    const baseCoverage = {
      sourceType: WarrantySourceType.PRODUCT,
      saleId: 21,
      serviceOrderId: null,
      productId: 5,
      sourceCodeSnapshot: 'RM',
      sourceNameSnapshot: 'RAM Kingston 8GB',
      coverageAmount: 50,
      customer: { id: 3, name: 'Daniel Méndez', documentNumber: '15151515' },
      sale: { series: 'B001', number: '00000025' },
      serviceOrder: null,
      createdAt: new Date('2026-09-01T12:00:00-05:00'),
    };
    const coverages = [
      { ...baseCoverage, id: 1, serialSnapshot: 'RM01', status: WarrantyCoverageStatus.ACTIVE },
      { ...baseCoverage, id: 2, serialSnapshot: 'RM02', status: WarrantyCoverageStatus.CONSUMED },
      { ...baseCoverage, id: 3, serialSnapshot: 'RM03', status: WarrantyCoverageStatus.ACTIVE },
    ] as WarrantyCoverage[];

    const group = (service as any).buildCoverageGroup({
      sourceType: WarrantySourceType.PRODUCT,
      saleId: 21,
      serviceOrderId: null,
      latestCreatedAt: baseCoverage.createdAt,
      unitCount: 3,
    }, coverages);

    expect(group.referenceCode).toBe('B001-00000025');
    expect(group.unitCount).toBe(3);
    expect(group.itemGroups).toHaveLength(1);
    expect(group.itemGroups[0].coverages).toHaveLength(3);
    expect(group.statusCounts.ACTIVE).toBe(2);
    expect(group.statusCounts.CONSUMED).toBe(1);
  });

  it.each([
    [ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES, WarrantyClaimStatus.RESOLVED_APPLIES],
    [ServiceOrderDiagnosisOutcome.WARRANTY_REJECTED, WarrantyClaimStatus.RESOLVED_REJECTED],
  ])('consume los S/50 completos cuando el diagnóstico termina en %s', async (outcome, expectedStatus) => {
    const claimRepository = repository();
    const coverageRepository = repository();
    const movementRepository = repository();
    const claim = {
      id: 4,
      coverageId: 8,
      status: WarrantyClaimStatus.IN_REVIEW,
      reviewStartedAt: new Date(),
      attendingTechnicianId: 9,
    } as WarrantyClaim;
    const coverage = {
      id: 8,
      status: WarrantyCoverageStatus.RESERVED,
      coverageAmount: 50,
    } as WarrantyCoverage;
    claimRepository.findOne.mockResolvedValue(claim);
    coverageRepository.findOne.mockResolvedValue(coverage);
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === WarrantyClaim) return claimRepository;
        if (entity === WarrantyCoverage) return coverageRepository;
        if (entity === WarrantyMovement) return movementRepository;
        throw new Error(`Repositorio inesperado: ${entity?.name}`);
      }),
    } as any;
    const service = new WarrantiesService(
      coverageRepository as any,
      claimRepository as any,
      movementRepository as any,
    );
    const diagnosis = { id: 20, outcome } as ServiceOrderDiagnosis;

    await service.consumeForDiagnosis(manager, 30, diagnosis, 9);

    expect(coverage.status).toBe(WarrantyCoverageStatus.CONSUMED);
    expect(claim.status).toBe(expectedStatus);
    expect(movementRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      type: WarrantyMovementType.CONSUMED,
      amount: 50,
      claimId: 4,
    }));
  });
});
