import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, In, IsNull, Repository } from 'typeorm';
import { WarrantyDurationUnit } from '../common/enums/warranty-duration-unit.enum';
import { Movement } from '../inventory/entities/movement.entity';
import { MovementSerial } from '../inventory/entities/movement-serial.entity';
import { Serial } from '../inventory/entities/serial.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { ServiceOrderDiagnosisOutcome } from '../service-orders/diagnoses/service-order-diagnosis-outcome.enum';
import { ServiceOrderDiagnosis } from '../service-orders/diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrder } from '../service-orders/entities/service-order.entity';
import { ServiceOrderItem } from '../service-orders/entities/service-order-item.entity';
import { ServiceOrderItemCommercialVersion } from '../service-orders/entities/service-order-item-commercial-version.entity';
import { ServiceOrderSaleLink } from '../service-orders/entities/service-order-sale-link.entity';
import { ServiceOrderOperativeStatus, ServiceType } from '../service-orders/enums';
import { ServiceOrderItemCommercialVersionStatus } from '../service-orders/service-agreements/service-order-item-commercial-version-status.enum';
import { User } from '../users/entities/user.entity';
import { ADMIN_ROLE_NAMES, hasRoleName } from '../common/constants/role-names';
import { JwtPayload } from '../common/utils/jwt-payload.type';
import { FilterWarrantiesDto, WarrantyTechnicianReportDto } from './dto/filter-warranties.dto';
import { WarrantyClaim } from './entities/warranty-claim.entity';
import { WarrantyCoverage } from './entities/warranty-coverage.entity';
import { WarrantyMovement } from './entities/warranty-movement.entity';
import { WarrantyClaimStatus } from './enums/warranty-claim-status.enum';
import { WarrantyCoverageStatus } from './enums/warranty-coverage-status.enum';
import { WarrantyMovementType } from './enums/warranty-movement-type.enum';
import { WarrantySourceType } from './enums/warranty-source-type.enum';
import { DEFAULT_SERVICE_WARRANTY_DURATION, WARRANTY_COVERAGE_AMOUNT } from './warranty.constants';
import { addWarrantyDuration } from './warranty-date.util';
import { resolveWarrantyTechnician } from './warranty-policy';

type Actor = { id?: number | null; name?: string | null };

type TechnicianReportRaw = {
  technicianId: string | number;
  technicianName: string;
  deliveredServices: string | number;
  consumedWarranties: string | number;
  appliedWarranties: string | number;
  rejectedWarranties: string | number;
};

@Injectable()
export class WarrantiesService {
  constructor(
    @InjectRepository(WarrantyCoverage)
    private readonly coverageRepository: Repository<WarrantyCoverage>,
    @InjectRepository(WarrantyClaim)
    private readonly claimRepository: Repository<WarrantyClaim>,
    @InjectRepository(WarrantyMovement)
    private readonly movementRepository: Repository<WarrantyMovement>,
  ) {}

  async issueProductCoveragesForSale(
    manager: EntityManager,
    saleId: number,
    actor: Actor = {},
  ): Promise<WarrantyCoverage[]> {
    const sale = await manager.getRepository(Sale).findOne({
      where: { id: saleId },
      relations: ['items', 'items.product'],
    });
    if (!sale || sale.status !== SaleStatus.CONFIRMED) return [];

    const serviceLink = await manager.getRepository(ServiceOrderSaleLink).findOne({
      where: { saleId, deletedAt: IsNull() },
      relations: ['serviceOrder'],
      order: { id: 'ASC' },
    });
    const operationalCustomerId = Number(serviceLink?.serviceOrder?.clientId ?? sale.customerId);
    const serialsByProduct = await this.loadSaleSerials(manager, saleId);
    const issued: WarrantyCoverage[] = [];

    for (const item of [...(sale.items ?? [])].sort((left, right) => Number(left.id) - Number(right.id))) {
      const product = item.product;
      const durationValue = Number(product?.warrantyDurationValue ?? 0);
      if (item.itemType !== 'PRODUCT' || !product || durationValue <= 0) continue;

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new BadRequestException(
          `El producto ${product.name} requiere una cantidad entera para emitir garantías por unidad`,
        );
      }
      const startsAt = sale.createdAt ? new Date(sale.createdAt) : new Date(`${sale.issueDate}T00:00:00-05:00`);
      const serialQueue = serialsByProduct.get(Number(product.id)) ?? [];

      for (let unit = 1; unit <= quantity; unit += 1) {
        const serial = product.isSerialized ? serialQueue.shift() : undefined;
        if (product.isSerialized && !serial) {
          throw new BadRequestException(`No se encontró el serial vendido para ${product.name}`);
        }
        const sourceUnitKey = serial
          ? `sale-item:${item.id}:serial:${serial.id}`
          : `sale-item:${item.id}:unit:${unit}`;
        const coverage = await this.createCoverageIfMissing(manager, {
          sourceType: WarrantySourceType.PRODUCT,
          sourceUnitKey,
          companyId: sale.companyId,
          customerId: operationalCustomerId,
          saleId: sale.id,
          saleItemId: item.id,
          serviceOrderId: serviceLink ? Number(serviceLink.serviceOrderId) : null,
          serviceOrderItemId: null,
          productId: product.id,
          serialId: serial?.id ?? null,
          sourceCodeSnapshot: product.sku,
          sourceNameSnapshot: product.name,
          serialSnapshot: serial?.serialCode ?? null,
          originTechnicianId: null,
          originTechnicianNameSnapshot: null,
          durationValue,
          durationUnit: product.warrantyDurationUnit ?? WarrantyDurationUnit.DAY,
          startsAt,
          actor,
        });
        if (coverage) issued.push(coverage);
      }
    }

    // También cubre el caso válido en que el equipo fue entregado antes de enlazar la venta.
    const linkedOrders = await manager.getRepository(ServiceOrderSaleLink).find({
      where: { saleId, deletedAt: IsNull() },
      relations: ['serviceOrder', 'serviceOrder.items'],
      order: { id: 'ASC' },
    });
    for (const link of linkedOrders) {
      issued.push(...await this.issueServiceCoveragesForDelivery(
        manager,
        link.serviceOrder,
        link.serviceOrder.items ?? [],
        actor,
      ));
    }
    return issued;
  }

  async issueServiceCoveragesForDelivery(
    manager: EntityManager,
    order: ServiceOrder,
    items: ServiceOrderItem[],
    actor: Actor = {},
  ): Promise<WarrantyCoverage[]> {
    if (order.serviceType === ServiceType.WARRANTY_SERVICE) return [];
    const eligibleItems = items.filter(
      (item) => item.deliveredAt && item.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA,
    );
    if (!eligibleItems.length) return [];

    const saleLink = await manager.getRepository(ServiceOrderSaleLink).findOne({
      where: { serviceOrderId: order.id, deletedAt: IsNull() },
      relations: ['sale'],
      order: { linkedAt: 'DESC' },
    });
    if (!saleLink || saleLink.sale.status !== SaleStatus.CONFIRMED) return [];
    if (!order.clientId) throw new BadRequestException('La orden no tiene cliente para emitir su garantía');
    if (!order.assignedToTechnicianId) {
      throw new BadRequestException('La orden no tiene técnico responsable para emitir su garantía');
    }
    const technician = await manager.getRepository(User).findOne({
      where: { id: order.assignedToTechnicianId },
    });
    if (!technician) throw new BadRequestException('El técnico responsable de la orden no existe');

    const issued: WarrantyCoverage[] = [];
    for (const item of eligibleItems) {
      const version = await manager.getRepository(ServiceOrderItemCommercialVersion).findOne({
        where: {
          serviceOrderItemId: item.id,
          status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        },
        order: { versionNumber: 'DESC', acceptedAt: 'DESC' },
      });
      const durationValue = Number(version?.warrantyDurationValue ?? DEFAULT_SERVICE_WARRANTY_DURATION);
      if (durationValue <= 0) continue;
      const coverage = await this.createCoverageIfMissing(manager, {
        sourceType: WarrantySourceType.SERVICE,
        sourceUnitKey: `service-item:${item.id}`,
        companyId: saleLink.sale.companyId,
        customerId: Number(order.clientId),
        saleId: saleLink.saleId,
        saleItemId: null,
        serviceOrderId: order.id,
        serviceOrderItemId: item.id,
        productId: null,
        serialId: null,
        sourceCodeSnapshot: item.code,
        sourceNameSnapshot: [item.brand, item.model].filter(Boolean).join(' ') || item.equipmentType,
        serialSnapshot: item.serialNumber,
        originTechnicianId: technician.id,
        originTechnicianNameSnapshot: technician.name,
        durationValue,
        durationUnit: version?.warrantyDurationUnit ?? WarrantyDurationUnit.DAY,
        startsAt: new Date(item.deliveredAt!),
        actor,
      });
      if (coverage) issued.push(coverage);
    }
    return issued;
  }

  async reserveCoverage(
    manager: EntityManager,
    coverageId: number,
    reportedIssue: string,
    actorId: number,
  ): Promise<{ coverage: WarrantyCoverage; claim: WarrantyClaim }> {
    const coverageRepository = manager.getRepository(WarrantyCoverage);
    const coverage = await coverageRepository.findOne({
      where: { id: coverageId },
      relations: ['product', 'serial', 'serviceOrderItem'],
      lock: { mode: 'pessimistic_write' },
    });
    if (!coverage) throw new NotFoundException('Cobertura de garantía no encontrada');
    await this.expireIfNeeded(manager, coverage, actorId);
    if (coverage.status !== WarrantyCoverageStatus.ACTIVE) {
      throw new BadRequestException(`La cobertura no está disponible: ${coverage.status}`);
    }

    const now = new Date();
    const claimRepository = manager.getRepository(WarrantyClaim);
    const claim = await claimRepository.save(
      claimRepository.create({
        coverageId: coverage.id,
        status: WarrantyClaimStatus.RECEIVED,
        serviceOrderId: null,
        serviceOrderItemId: null,
        diagnosisId: null,
        outcome: null,
        originTechnicianId: coverage.originTechnicianId,
        attendingTechnicianId: null,
        technicianOverrideReason: null,
        reportedIssue: reportedIssue.trim(),
        reservedAt: now,
        reviewStartedAt: null,
        resolvedAt: null,
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
        createdBy: actorId,
      }),
    );
    coverage.status = WarrantyCoverageStatus.RESERVED;
    await coverageRepository.save(coverage);
    await this.recordMovement(manager, coverage, WarrantyMovementType.RESERVED, actorId, null, claim.id);
    return { coverage, claim };
  }

  async linkClaimToOrder(
    manager: EntityManager,
    claimId: number,
    serviceOrderId: number,
    serviceOrderItemId: number,
    attendingTechnicianId: number,
    overrideReason?: string,
  ): Promise<WarrantyClaim> {
    const repository = manager.getRepository(WarrantyClaim);
    const claim = await repository.findOne({ where: { id: claimId }, lock: { mode: 'pessimistic_write' } });
    if (!claim) throw new NotFoundException('Reclamo de garantía no encontrado');
    claim.serviceOrderId = serviceOrderId;
    claim.serviceOrderItemId = serviceOrderItemId;
    claim.attendingTechnicianId = attendingTechnicianId;
    claim.technicianOverrideReason = overrideReason?.trim() || null;
    await repository.save(claim);
    if (claim.originTechnicianId && claim.originTechnicianId !== attendingTechnicianId) {
      const coverage = await manager.getRepository(WarrantyCoverage).findOneByOrFail({ id: claim.coverageId });
      await this.recordMovement(
        manager,
        coverage,
        WarrantyMovementType.TECHNICIAN_OVERRIDDEN,
        null,
        overrideReason ?? null,
        claim.id,
        { originTechnicianId: claim.originTechnicianId, attendingTechnicianId },
      );
    }
    return claim;
  }

  async markClaimInReview(manager: EntityManager, serviceOrderId: number, actorId?: number): Promise<void> {
    const claim = await manager.getRepository(WarrantyClaim).findOne({
      where: { serviceOrderId, status: WarrantyClaimStatus.RECEIVED },
      lock: { mode: 'pessimistic_write' },
    });
    if (!claim) return;
    claim.status = WarrantyClaimStatus.IN_REVIEW;
    claim.reviewStartedAt = new Date();
    claim.attendingTechnicianId = actorId ?? claim.attendingTechnicianId;
    await manager.getRepository(WarrantyClaim).save(claim);
  }

  async assertTechnicianAssignment(
    manager: EntityManager,
    serviceOrder: ServiceOrder,
    technicianId: number,
    viewer?: Pick<JwtPayload, 'roles'>,
    overrideReason?: string,
    actorId?: number,
  ): Promise<void> {
    if (!serviceOrder.warrantyClaimId) return;
    const claimRepository = manager.getRepository(WarrantyClaim);
    const claim = await claimRepository.findOne({
      where: { id: serviceOrder.warrantyClaimId },
      relations: ['coverage'],
      lock: { mode: 'pessimistic_write' },
    });
    if (!claim) throw new NotFoundException('Reclamo de garantía asociado no encontrado');

    const assignment = resolveWarrantyTechnician({
      sourceType: claim.coverage.sourceType,
      originTechnicianId: claim.originTechnicianId,
      requestedTechnicianId: technicianId,
      isAdmin: hasRoleName(viewer?.roles, ADMIN_ROLE_NAMES),
      overrideReason,
    });
    claim.attendingTechnicianId = assignment.technicianId;
    if (!assignment.overridden) {
      await claimRepository.save(claim);
      return;
    }

    claim.technicianOverrideReason = overrideReason!.trim();
    await claimRepository.save(claim);
    await this.recordMovement(
      manager,
      claim.coverage,
      WarrantyMovementType.TECHNICIAN_OVERRIDDEN,
      actorId ?? null,
      claim.technicianOverrideReason,
      claim.id,
      {
        originTechnicianId: claim.originTechnicianId,
        attendingTechnicianId: assignment.technicianId,
      },
    );
  }

  async consumeForDiagnosis(
    manager: EntityManager,
    serviceOrderId: number,
    diagnosis: ServiceOrderDiagnosis,
    actorId?: number,
  ): Promise<WarrantyClaim | null> {
    if (![ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES, ServiceOrderDiagnosisOutcome.WARRANTY_REJECTED].includes(diagnosis.outcome)) {
      return null;
    }
    const claimRepository = manager.getRepository(WarrantyClaim);
    const claim = await claimRepository.findOne({
      where: { serviceOrderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!claim) return null;
    const coverageRepository = manager.getRepository(WarrantyCoverage);
    const coverage = await coverageRepository.findOne({
      where: { id: claim.coverageId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!coverage) throw new NotFoundException('Cobertura del reclamo no encontrada');
    if (coverage.status === WarrantyCoverageStatus.CONSUMED) return claim;
    if (coverage.status !== WarrantyCoverageStatus.RESERVED) {
      throw new BadRequestException(`No se puede consumir una cobertura en estado ${coverage.status}`);
    }

    const now = new Date();
    coverage.status = WarrantyCoverageStatus.CONSUMED;
    coverage.consumedAt = now;
    claim.status = diagnosis.outcome === ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES
      ? WarrantyClaimStatus.RESOLVED_APPLIES
      : WarrantyClaimStatus.RESOLVED_REJECTED;
    claim.diagnosisId = diagnosis.id;
    claim.outcome = diagnosis.outcome;
    claim.resolvedAt = now;
    claim.reviewStartedAt ??= now;
    claim.attendingTechnicianId = actorId ?? claim.attendingTechnicianId;
    await coverageRepository.save(coverage);
    await claimRepository.save(claim);
    await this.recordMovement(
      manager,
      coverage,
      WarrantyMovementType.CONSUMED,
      actorId ?? null,
      diagnosis.outcome,
      claim.id,
      { diagnosisId: diagnosis.id, outcome: diagnosis.outcome },
    );
    return claim;
  }

  async cancelClaim(claimId: number, actorId: number, reason: string): Promise<WarrantyClaim> {
    return this.claimRepository.manager.transaction(async (manager) => {
      const claimRepository = manager.getRepository(WarrantyClaim);
      const claim = await claimRepository.findOne({ where: { id: claimId }, lock: { mode: 'pessimistic_write' } });
      if (!claim) throw new NotFoundException('Reclamo de garantía no encontrado');
      if (claim.status === WarrantyClaimStatus.CANCELLED) return claim;
      if (claim.status !== WarrantyClaimStatus.RECEIVED) {
        throw new BadRequestException('Solo se puede cancelar una garantía antes de iniciar la revisión técnica');
      }
      const coverageRepository = manager.getRepository(WarrantyCoverage);
      const coverage = await coverageRepository.findOne({
        where: { id: claim.coverageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!coverage || coverage.status !== WarrantyCoverageStatus.RESERVED) {
        throw new BadRequestException('La cobertura del reclamo ya no está reservada');
      }
      claim.status = WarrantyClaimStatus.CANCELLED;
      claim.cancelledAt = new Date();
      claim.cancelledBy = actorId;
      claim.cancellationReason = reason.trim();
      coverage.status = WarrantyCoverageStatus.ACTIVE;
      await claimRepository.save(claim);
      await coverageRepository.save(coverage);
      await this.recordMovement(manager, coverage, WarrantyMovementType.RELEASED, actorId, reason, claim.id);
      return claim;
    });
  }

  async revokeForSaleCancellation(manager: EntityManager, saleId: number, actor: Actor = {}): Promise<void> {
    const repository = manager.getRepository(WarrantyCoverage);
    const coverages = await repository.find({
      where: { saleId, status: In([
        WarrantyCoverageStatus.ACTIVE,
        WarrantyCoverageStatus.RESERVED,
        WarrantyCoverageStatus.CONSUMED,
        WarrantyCoverageStatus.EXPIRED,
      ]) },
      lock: { mode: 'pessimistic_write' },
    });
    const blocked = coverages.find((coverage) =>
      [WarrantyCoverageStatus.RESERVED, WarrantyCoverageStatus.CONSUMED].includes(coverage.status),
    );
    if (blocked) {
      throw new BadRequestException(
        blocked.status === WarrantyCoverageStatus.CONSUMED
          ? 'La venta tiene una garantía consumida y requiere reversión administrativa'
          : 'La venta tiene una garantía en atención; cancela primero el reclamo',
      );
    }
    for (const coverage of coverages) {
      coverage.status = WarrantyCoverageStatus.REVOKED;
      coverage.revokedAt = new Date();
      await repository.save(coverage);
      await this.recordMovement(
        manager,
        coverage,
        WarrantyMovementType.REVOKED,
        actor.id ?? null,
        'Venta de origen anulada',
        null,
        { saleId },
        actor.name,
      );
    }
  }

  async findCoverages(filter: FilterWarrantiesDto) {
    const page = Math.max(1, Number(filter.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filter.limit ?? 20)));
    const qb = this.coverageRepository
      .createQueryBuilder('coverage')
      .leftJoinAndSelect('coverage.customer', 'customer')
      .leftJoinAndSelect('coverage.product', 'product')
      .leftJoinAndSelect('coverage.serial', 'serial')
      .orderBy('coverage.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (filter.customerId) qb.andWhere('coverage.customerId = :customerId', { customerId: filter.customerId });
    if (filter.sourceType) qb.andWhere('coverage.sourceType = :sourceType', { sourceType: filter.sourceType });
    if (filter.status) qb.andWhere('coverage.status = :status', { status: filter.status });
    if (filter.search?.trim()) {
      qb.andWhere(new Brackets((where) => {
        where.where('coverage.sourceCodeSnapshot LIKE :search')
          .orWhere('coverage.sourceNameSnapshot LIKE :search')
          .orWhere('coverage.serialSnapshot LIKE :search')
          .orWhere('customer.name LIKE :search');
      })).setParameter('search', `%${filter.search.trim()}%`);
    }
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findClaims(filter: FilterWarrantiesDto) {
    const page = Math.max(1, Number(filter.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filter.limit ?? 20)));
    const [data, total] = await this.claimRepository.findAndCount({
      relations: ['coverage', 'coverage.customer', 'coverage.product', 'attendingTechnician'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getTechnicianReport(filter: WarrantyTechnicianReportDto) {
    const qb = this.coverageRepository
      .createQueryBuilder('coverage')
      .leftJoin(WarrantyClaim, 'claim', 'claim.coverage_id = coverage.id')
      .where('coverage.sourceType = :sourceType', { sourceType: WarrantySourceType.SERVICE })
      .andWhere('coverage.originTechnicianId IS NOT NULL')
      .select('coverage.originTechnicianId', 'technicianId')
      .addSelect('coverage.originTechnicianNameSnapshot', 'technicianName')
      .addSelect('COUNT(DISTINCT coverage.id)', 'deliveredServices')
      .addSelect(`SUM(CASE WHEN coverage.status = '${WarrantyCoverageStatus.CONSUMED}' THEN 1 ELSE 0 END)`, 'consumedWarranties')
      .addSelect(`SUM(CASE WHEN claim.status = '${WarrantyClaimStatus.RESOLVED_APPLIES}' THEN 1 ELSE 0 END)`, 'appliedWarranties')
      .addSelect(`SUM(CASE WHEN claim.status = '${WarrantyClaimStatus.RESOLVED_REJECTED}' THEN 1 ELSE 0 END)`, 'rejectedWarranties')
      .groupBy('coverage.originTechnicianId')
      .addGroupBy('coverage.originTechnicianNameSnapshot')
      .orderBy('consumedWarranties', 'DESC');
    if (filter.dateFrom) qb.andWhere('coverage.startsAt >= :dateFrom', { dateFrom: `${filter.dateFrom} 00:00:00` });
    if (filter.dateTo) qb.andWhere('coverage.startsAt <= :dateTo', { dateTo: `${filter.dateTo} 23:59:59` });
    const rows = await qb.getRawMany<TechnicianReportRaw>();
    return {
      generatedAt: new Date(),
      technicians: rows.map((row, index) => {
        const deliveredServices = Number(row.deliveredServices ?? 0);
        const consumedWarranties = Number(row.consumedWarranties ?? 0);
        return {
          rank: index + 1,
          technicianId: Number(row.technicianId),
          technicianName: row.technicianName,
          deliveredServices,
          consumedWarranties,
          appliedWarranties: Number(row.appliedWarranties ?? 0),
          rejectedWarranties: Number(row.rejectedWarranties ?? 0),
          consumedAmount: Number((consumedWarranties * WARRANTY_COVERAGE_AMOUNT).toFixed(2)),
          warrantyRate: deliveredServices
            ? Number(((consumedWarranties / deliveredServices) * 100).toFixed(2))
            : 0,
        };
      }),
    };
  }

  private async loadSaleSerials(manager: EntityManager, saleId: number): Promise<Map<number, Serial[]>> {
    const movements = await manager.getRepository(Movement).find({
      where: { type: 'OUT', sourceDocType: 'SALE', sourceDocId: String(saleId) },
      order: { id: 'ASC' },
    });
    const result = new Map<number, Serial[]>();
    for (const movement of movements) {
      const links = await manager.getRepository(MovementSerial).find({
        where: { movementId: movement.id },
        relations: ['serial'],
        order: { id: 'ASC' },
      });
      const queue = result.get(Number(movement.productId)) ?? [];
      queue.push(...links.map((link) => link.serial));
      result.set(Number(movement.productId), queue);
    }
    return result;
  }

  private async createCoverageIfMissing(
    manager: EntityManager,
    input: Omit<WarrantyCoverage, 'id' | 'customer' | 'sale' | 'saleItem' | 'serviceOrder' | 'serviceOrderItem' | 'product' | 'serial' | 'originTechnician' | 'claims' | 'status' | 'expiresAt' | 'coverageAmount' | 'consumedAt' | 'revokedAt' | 'createdAt' | 'updatedAt'> & { actor: Actor },
  ): Promise<WarrantyCoverage | null> {
    const repository = manager.getRepository(WarrantyCoverage);
    const existing = await repository.findOne({
      where: { sourceType: input.sourceType, sourceUnitKey: input.sourceUnitKey },
    });
    if (existing) return null;
    const { actor, ...values } = input;
    const coverage = await repository.save(
      repository.create({
        ...values,
        expiresAt: addWarrantyDuration(input.startsAt, input.durationValue, input.durationUnit),
        coverageAmount: WARRANTY_COVERAGE_AMOUNT,
        status: WarrantyCoverageStatus.ACTIVE,
        consumedAt: null,
        revokedAt: null,
      }),
    );
    await this.recordMovement(
      manager,
      coverage,
      WarrantyMovementType.ISSUED,
      actor.id ?? null,
      'Cobertura emitida',
      null,
      null,
      actor.name,
    );
    return coverage;
  }

  private async expireIfNeeded(manager: EntityManager, coverage: WarrantyCoverage, actorId?: number): Promise<void> {
    if (coverage.status !== WarrantyCoverageStatus.ACTIVE || coverage.expiresAt.getTime() >= Date.now()) return;
    coverage.status = WarrantyCoverageStatus.EXPIRED;
    await manager.getRepository(WarrantyCoverage).save(coverage);
    await this.recordMovement(manager, coverage, WarrantyMovementType.EXPIRED, actorId ?? null, 'Vigencia finalizada');
  }

  private async recordMovement(
    manager: EntityManager,
    coverage: WarrantyCoverage,
    type: WarrantyMovementType,
    actorId: number | null,
    reason: string | null,
    claimId: number | null = null,
    metadataJson: Record<string, unknown> | null = null,
    actorName?: string | null,
  ): Promise<void> {
    const repository = manager.getRepository(WarrantyMovement);
    await repository.save(repository.create({
      coverageId: coverage.id,
      claimId,
      type,
      amount: type === WarrantyMovementType.CONSUMED ? Number(coverage.coverageAmount) : 0,
      actorId,
      actorNameSnapshot: actorName ?? null,
      reason,
      metadataJson,
    }));
  }
}
