import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { CreateServiceOrderAgreementDto } from './dto/create-service-agreement.dto';
import { ServiceOrderAgreementProductItemDto } from './dto/service-agreement-product-item.dto';
import { ServiceOrderAgreementServiceItemDto } from './dto/service-agreement-service-item.dto';
import { UpdateServiceOrderAgreementDto } from './dto/update-service-agreement.dto';
import { ServiceOrderAgreementLineProvenance } from './service-agreement-line-provenance.enum';
import { ServiceOrderAgreementSource } from './service-agreement-source.enum';
import { ServiceOrderAgreementProduct } from './entities/service-agreement-product.entity';
import { ServiceOrderAgreementServiceItem } from './entities/service-agreement-service-item.entity';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from './service-agreement-status.enum';

type FindAgreementsQuery = {
  page?: number | string;
  limit?: number | string;
  serviceOrderId?: number | string;
  status?: string;
  withDeleted?: string;
};

type TechnicianRevenueRankingRow = {
  technicianId: number;
  technicianName: string;
  itemsCount: number;
  totalRevenue: number;
  productRevenue: number;
  serviceRevenue: number;
  diagnosisRevenue: number;
  standardRevenue: number;
  diagnosisItemsCount: number;
  standardItemsCount: number;
};

const TECHNICAL_SERVICE_CODE = 'TECHNICAL_SERVICE';
const TECHNICAL_SERVICE_NAME = 'Servicio técnico';
const TECHNICAL_SERVICE_MINIMUM_AMOUNT = 20;

@Injectable()
export class ServiceOrderAgreementsService {
  constructor(
    @InjectRepository(ServiceOrderAgreement)
    private readonly agreementRepository: Repository<ServiceOrderAgreement>,
    @InjectRepository(ServiceOrderAgreementProduct)
    private readonly agreementProductRepository: Repository<ServiceOrderAgreementProduct>,
    @InjectRepository(ServiceOrderAgreementServiceItem)
    private readonly agreementServiceItemRepository: Repository<ServiceOrderAgreementServiceItem>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly diagnosisRepository: Repository<ServiceOrderDiagnosis>,
    private readonly workflowService: ServiceOrderWorkflowService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
  ) {}

  async findAll(query: FindAgreementsQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<ServiceOrderAgreementStatus>(query.status, ServiceOrderAgreementStatus, 'status');
    const qb = this.agreementRepository
      .createQueryBuilder('agreement')
      .leftJoinAndSelect('agreement.productItems', 'productItems')
      .leftJoinAndSelect('productItems.product', 'product')
      .leftJoinAndSelect('agreement.serviceItems', 'serviceItems')
      .leftJoinAndSelect('agreement.serviceOrder', 'serviceOrder')
      .leftJoinAndSelect('serviceOrder.assignedTechnician', 'assignedTechnician')
      .orderBy('agreement.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.withDeleted === 'true') qb.withDeleted();
    if (query.serviceOrderId !== undefined) {
      qb.andWhere('agreement.serviceOrderId = :serviceOrderId', {
        serviceOrderId: this.parsePositiveNumber(query.serviceOrderId, undefined, 'serviceOrderId'),
      });
    }
    if (statuses?.length) qb.andWhere('agreement.status IN (:...statuses)', { statuses });

    const [data, total] = await qb.getManyAndCount();
    return { data: data.map((agreement) => this.serializeAgreement(agreement)), total, page, limit };
  }

  async findOne(id: number, withDeleted = false) {
    const agreement = await this.agreementRepository.findOne({
      where: { id },
      relations: [
        'serviceOrder',
        'serviceOrder.assignedTechnician',
        'productItems',
        'productItems.product',
        'serviceItems',
      ],
      withDeleted,
    });
    if (!agreement) throw new NotFoundException(`ServiceOrderAgreement with id ${id} not found`);
    return this.serializeAgreement(agreement);
  }

  async getTechnicianRevenueRankings() {
    const agreements = await this.agreementRepository.find({
      relations: ['serviceOrder', 'serviceOrder.assignedTechnician', 'productItems', 'serviceItems'],
      order: { serviceOrderId: 'ASC', sequenceNumber: 'DESC' },
    });

    const allowedTypes = new Set([ServiceType.DIAGNOSIS, ServiceType.STANDARD_SERVICE]);
    const grouped = new Map<number, ServiceOrderAgreement[]>();

    for (const agreement of agreements) {
      const order = agreement.serviceOrder;
      if (
        !order ||
        order.deletedAt ||
        !order.assignedToTechnicianId ||
        !allowedTypes.has(order.serviceType) ||
        agreement.status !== ServiceOrderAgreementStatus.CONFIRMED
      ) {
        continue;
      }
      const existing = grouped.get(order.id) ?? [];
      existing.push(agreement);
      grouped.set(order.id, existing);
    }

    const rankingMap = new Map<number, TechnicianRevenueRankingRow>();

    for (const orderAgreements of grouped.values()) {
      const effectiveAgreement = this.pickEffectiveAgreement(orderAgreements);
      if (!effectiveAgreement) continue;

      const order = effectiveAgreement.serviceOrder;
      if (!order?.assignedToTechnicianId) continue;

      const technicianId = Number(order.assignedToTechnicianId);
      const technicianName =
        order.assignedTechnician?.name ?? order.assignedToTechnicianName ?? `Tecnico #${technicianId}`;
      const productRevenue = (effectiveAgreement.productItems ?? []).reduce(
        (acc, product) => acc + Number(product.lineTotal ?? 0),
        0,
      );
      const serviceRevenue = (effectiveAgreement.serviceItems ?? []).reduce(
        (acc, service) => acc + Number(service.lineTotal ?? 0),
        0,
      );
      const totalRevenue = Number((productRevenue + serviceRevenue).toFixed(2));

      const current = rankingMap.get(technicianId) ?? {
        technicianId,
        technicianName,
        itemsCount: 0,
        totalRevenue: 0,
        productRevenue: 0,
        serviceRevenue: 0,
        diagnosisRevenue: 0,
        standardRevenue: 0,
        diagnosisItemsCount: 0,
        standardItemsCount: 0,
      };

      current.itemsCount += 1;
      current.totalRevenue = Number((current.totalRevenue + totalRevenue).toFixed(2));
      current.productRevenue = Number((current.productRevenue + productRevenue).toFixed(2));
      current.serviceRevenue = Number((current.serviceRevenue + serviceRevenue).toFixed(2));

      if (order.serviceType === ServiceType.DIAGNOSIS) {
        current.diagnosisRevenue = Number((current.diagnosisRevenue + totalRevenue).toFixed(2));
        current.diagnosisItemsCount += 1;
      } else if (order.serviceType === ServiceType.STANDARD_SERVICE) {
        current.standardRevenue = Number((current.standardRevenue + totalRevenue).toFixed(2));
        current.standardItemsCount += 1;
      }

      rankingMap.set(technicianId, current);
    }

    const rows = Array.from(rankingMap.values()).sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      if (b.serviceRevenue !== a.serviceRevenue) return b.serviceRevenue - a.serviceRevenue;
      return a.technicianName.localeCompare(b.technicianName);
    });

    return {
      generatedAt: new Date(),
      technicians: rows.map((row, index) => ({
        ...row,
        rank: index + 1,
      })),
    };
  }

  async create(dto: CreateServiceOrderAgreementDto) {
    const serviceOrder = await this.ensureServiceOrder(dto.serviceOrderId);
    if (serviceOrder.serviceType === ServiceType.WARRANTY_SERVICE) {
      throw new BadRequestException('Warranty service orders do not use agreements');
    }

    const diagnosis = dto.diagnosisId ? await this.ensureDiagnosis(dto.diagnosisId) : null;
    if (diagnosis && diagnosis.serviceOrderId !== serviceOrder.id) {
      throw new BadRequestException('Diagnosis does not belong to the provided service order');
    }

    const baseAgreement = dto.baseAgreementId
      ? await this.resolveDerivedBaseAgreement(serviceOrder, diagnosis, dto.baseAgreementId)
      : null;

    this.ensureCreatePayloadCompatibility(dto, Boolean(baseAgreement));

    if (!baseAgreement) {
      this.ensureTechnicalServiceAmount(dto.technicalServiceAmount);
    }

    const targetStatus = dto.status ?? ServiceOrderAgreementStatus.DRAFT;
    const targetSource = dto.source ?? ServiceOrderAgreementSource.TECHNICIAN_COORDINATION;

    if (baseAgreement && targetStatus !== ServiceOrderAgreementStatus.DRAFT) {
      throw new BadRequestException('Derived agreements must start as draft');
    }

    const agreement = await this.agreementRepository.manager.transaction(async (manager) => {
      const inheritedProductItems = baseAgreement
        ? this.cloneInheritedProductItems(baseAgreement.productItems ?? [], manager)
        : [];
      const additionalProductItems = baseAgreement
        ? await this.buildNewProductItems(dto.newProducts, manager, serviceOrder.serviceType)
        : await this.buildProductItems(dto.products, manager, serviceOrder.serviceType);
      const productItems = [...inheritedProductItems, ...additionalProductItems];
      const serviceItems = baseAgreement
        ? this.cloneInheritedServiceItems(
            baseAgreement.serviceItems ?? [],
            manager,
            serviceOrder.serviceType,
            dto.technicalServiceAmount,
          )
        : this.buildTechnicalServiceItems(dto.technicalServiceAmount!, serviceOrder.serviceType);

      await this.supersedePrevious(manager, serviceOrder.id, targetStatus);

      const saved = await manager.getRepository(ServiceOrderAgreement).save({
        serviceOrderId: serviceOrder.id,
        diagnosisId: diagnosis?.id ?? null,
        derivedFromAgreementId: baseAgreement?.id ?? null,
        sequenceNumber: dto.sequenceNumber ?? (await this.resolveNextSequence(manager, serviceOrder.id)),
        status: targetStatus,
        source: targetSource,
        totalAmount: this.calculateTotalAmount(productItems, serviceItems),
        notes: dto.notes ?? baseAgreement?.notes ?? null,
        agreedAt: targetStatus === ServiceOrderAgreementStatus.CONFIRMED ? new Date() : null,
        agreedByUserId: null,
      });

      await this.persistProductItems(manager, saved.id, productItems);
      await this.persistServiceItems(manager, saved.id, serviceItems);
      return saved;
    });

    await this.syncCanonicalCommercialAfterAgreementCreate(serviceOrder.id, targetStatus, agreement.totalAmount);
    if (targetStatus === ServiceOrderAgreementStatus.CONFIRMED) {
      await this.messageMatrixService.notifyAgreementConfirmed(
        await this.ensureServiceOrder(serviceOrder.id),
        agreement.id,
      );
    }
    return this.findOne(agreement.id);
  }

  async update(id: number, dto: UpdateServiceOrderAgreementDto) {
    const agreement = await this.agreementRepository.findOne({
      where: { id },
      relations: ['serviceOrder', 'productItems', 'serviceItems'],
    });
    if (!agreement) throw new NotFoundException(`ServiceOrderAgreement with id ${id} not found`);
    if (agreement.deletedAt) throw new BadRequestException('Cannot update a deleted agreement');
    if (agreement.status !== ServiceOrderAgreementStatus.DRAFT) {
      throw new BadRequestException('Only draft agreements can be updated directly');
    }

    const serviceOrder = agreement.serviceOrder;

    this.ensureNoLegacyUpdateFields(dto as Record<string, unknown>);

    const updatedAgreement = await this.agreementRepository.manager.transaction(async (manager) => {
      const currentProductItems = agreement.productItems ?? (await this.loadCurrentProductItems(manager, agreement.id));
      const currentServiceItems = agreement.serviceItems ?? (await this.loadCurrentServiceItems(manager, agreement.id));
      const newProductItems = dto.newProducts?.length
        ? await this.buildNewProductItems(dto.newProducts, manager, serviceOrder.serviceType)
        : [];

      const nextServiceItems = dto.technicalServiceAmount !== undefined
        ? await this.upsertTechnicalServiceAmount(
            manager,
            agreement,
            currentServiceItems,
            dto.technicalServiceAmount,
            serviceOrder.serviceType,
          )
        : currentServiceItems;

      if (newProductItems.length) {
        await this.persistProductItems(manager, agreement.id, newProductItems);
      }

      if (dto.technicalServiceAmount !== undefined) {
        this.ensureTechnicalServiceAmount(dto.technicalServiceAmount);
      }

      await manager.getRepository(ServiceOrderAgreement).update(agreement.id, {
        notes: dto.notes ?? agreement.notes,
        totalAmount: this.calculateTotalAmount(
          [...currentProductItems, ...newProductItems],
          nextServiceItems,
        ),
      });

      return this.findOne(agreement.id);
    });

    await this.syncCanonicalCommercialAfterAgreementCreate(
      serviceOrder.id,
      ServiceOrderAgreementStatus.DRAFT,
      updatedAgreement.totalAmount,
    );

    return updatedAgreement;
  }

  async confirm(id: number) {
    const agreement = await this.findEditableAgreement(id, ['serviceOrder']);
    if (agreement.status === ServiceOrderAgreementStatus.CONFIRMED) {
      return this.findOne(id);
    }
    if (agreement.status !== ServiceOrderAgreementStatus.DRAFT) {
      throw new BadRequestException('Only draft agreements can be confirmed');
    }

    await this.agreementRepository.manager.transaction(async (manager) => {
      await manager
        .getRepository(ServiceOrderAgreement)
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderAgreementStatus.SUPERSEDED })
        .where('service_order_id = :serviceOrderId', { serviceOrderId: agreement.serviceOrderId })
        .andWhere('id <> :id', { id: agreement.id })
        .andWhere('status IN (:...statuses)', {
          statuses: [ServiceOrderAgreementStatus.DRAFT, ServiceOrderAgreementStatus.CONFIRMED],
        })
        .execute();

      await manager.getRepository(ServiceOrderAgreement).update(agreement.id, {
        status: ServiceOrderAgreementStatus.CONFIRMED,
        agreedAt: new Date(),
      });
    });

    await this.workflowService.changeTechnicalStatus(
      agreement.serviceOrderId,
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
    );
    await this.syncCanonicalCommercialAfterConfirmation(agreement.serviceOrderId, agreement.totalAmount);
    await this.messageMatrixService.notifyAgreementConfirmed(
      await this.ensureServiceOrder(agreement.serviceOrderId),
      agreement.id,
    );
    return this.findOne(id);
  }

  async void(id: number, notes?: string) {
    const agreement = await this.findEditableAgreement(id, ['serviceOrder']);
    if (agreement.status === ServiceOrderAgreementStatus.VOIDED) {
      return this.findOne(id);
    }

    await this.agreementRepository.update(id, {
      status: ServiceOrderAgreementStatus.VOIDED,
      notes: notes ?? agreement.notes,
    });
    if (agreement.serviceOrder?.serviceType === ServiceType.DIAGNOSIS) {
      await this.createAutomaticTechnicalServiceAgreement(agreement.serviceOrderId, notes);
    }
    await this.syncCanonicalCommercialAfterVoid(agreement.serviceOrderId);
    return this.findOne(id);
  }

  async createDiagnosisFeeAgreement(serviceOrderId: number) {
    const agreement = await this.createAutomaticTechnicalServiceAgreement(serviceOrderId);

    await this.workflowService.changeTechnicalStatus(serviceOrderId, ServiceOrderTechnicalStatus.RESUELTA);
    await this.syncCanonicalCommercialAfterConfirmation(serviceOrderId, agreement.totalAmount);
    return this.findOne(agreement.id);
  }

  async softDelete(id: number) {
    await this.ensureAgreement(id);
    await this.agreementRepository.softDelete(id);
    return { ok: true, message: `ServiceOrderAgreement ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.agreementRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} service order agreements deleted successfully` };
  }

  async restore(id: number) {
    const agreement = await this.agreementRepository.findOne({ where: { id }, withDeleted: true });
    if (!agreement) throw new NotFoundException(`ServiceOrderAgreement with id ${id} not found`);
    if (!agreement.deletedAt) return { ok: true, message: 'ServiceOrderAgreement already active' };
    await this.agreementRepository.restore(id);
    return { ok: true, message: `ServiceOrderAgreement ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    const existing = await this.agreementRepository.find({ where: { id: In(ids) }, withDeleted: true });
    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) throw new NotFoundException('No service order agreements found to restore');
    await this.agreementRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} service order agreements restored successfully` };
  }

  private async syncCanonicalCommercialAfterAgreementCreate(
    serviceOrderId: number,
    status: ServiceOrderAgreementStatus,
    totalAmount: number,
  ): Promise<void> {
    const serviceOrder = await this.ensureServiceOrder(serviceOrderId);

    if (status === ServiceOrderAgreementStatus.CONFIRMED) {
      serviceOrder.commercialStatus = ServiceOrderCommercialStatus.AUTORIZADA;
      serviceOrder.technicalStatus = ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION;
      serviceOrder.montoComprometidoVigente = Number(totalAmount ?? 0);
      serviceOrder.economicStatus = Number(totalAmount ?? 0) > 0
        ? ServiceOrderEconomicStatus.PENDIENTE
        : ServiceOrderEconomicStatus.NO_APLICA;
    } else {
      serviceOrder.commercialStatus = ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE;
      serviceOrder.montoComprometidoVigente = Number(totalAmount ?? 0);
      if (Number(totalAmount ?? 0) > 0) {
        serviceOrder.economicStatus = ServiceOrderEconomicStatus.PENDIENTE;
      }
    }

    await this.serviceOrderRepository.save(serviceOrder);
  }

  private async syncCanonicalCommercialAfterConfirmation(
    serviceOrderId: number,
    totalAmount: number,
  ): Promise<void> {
    const serviceOrder = await this.ensureServiceOrder(serviceOrderId);
    serviceOrder.commercialStatus = ServiceOrderCommercialStatus.AUTORIZADA;
    serviceOrder.technicalStatus = ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION;
    serviceOrder.montoComprometidoVigente = Number(totalAmount ?? 0);
    serviceOrder.economicStatus = Number(totalAmount ?? 0) > 0
      ? ServiceOrderEconomicStatus.PENDIENTE
      : ServiceOrderEconomicStatus.NO_APLICA;
    await this.serviceOrderRepository.save(serviceOrder);
  }

  private async syncCanonicalCommercialAfterVoid(serviceOrderId: number): Promise<void> {
    const serviceOrder = await this.ensureServiceOrder(serviceOrderId);
    const activeAgreement = await this.agreementRepository.findOne({
      where: { serviceOrderId, status: In([ServiceOrderAgreementStatus.DRAFT, ServiceOrderAgreementStatus.CONFIRMED]) },
      order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
    });

    if (activeAgreement) {
      serviceOrder.commercialStatus = activeAgreement.status === ServiceOrderAgreementStatus.CONFIRMED
        ? ServiceOrderCommercialStatus.AUTORIZADA
        : ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE;
      serviceOrder.montoComprometidoVigente = Number(activeAgreement.totalAmount ?? 0);
      serviceOrder.economicStatus = Number(activeAgreement.totalAmount ?? 0) > 0
        ? ServiceOrderEconomicStatus.PENDIENTE
        : ServiceOrderEconomicStatus.NO_APLICA;
    } else {
      serviceOrder.commercialStatus = ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA;
      serviceOrder.montoComprometidoVigente = 0;
      serviceOrder.economicStatus = ServiceOrderEconomicStatus.NO_APLICA;
    }

    await this.serviceOrderRepository.save(serviceOrder);
  }

  private async supersedePrevious(
    manager: EntityManager,
    serviceOrderId: number,
    incomingStatus: ServiceOrderAgreementStatus,
  ) {
    const statusesToSupersede =
      incomingStatus === ServiceOrderAgreementStatus.CONFIRMED
        ? [ServiceOrderAgreementStatus.DRAFT, ServiceOrderAgreementStatus.CONFIRMED]
        : [ServiceOrderAgreementStatus.DRAFT];

    await manager
      .getRepository(ServiceOrderAgreement)
      .createQueryBuilder()
      .update()
      .set({ status: ServiceOrderAgreementStatus.SUPERSEDED })
      .where('service_order_id = :serviceOrderId', { serviceOrderId })
      .andWhere('status IN (:...statuses)', { statuses: statusesToSupersede })
      .execute();
  }

  private async findEditableAgreement(id: number, relations?: string[]) {
    const agreement = await this.agreementRepository.findOne({ where: { id }, relations });
    if (!agreement) throw new NotFoundException(`ServiceOrderAgreement with id ${id} not found`);
    if (agreement.deletedAt) throw new BadRequestException('Cannot operate on a deleted agreement');
    return agreement;
  }

  private async ensureServiceOrder(id: number) {
    const serviceOrder = await this.serviceOrderRepository.findOne({ where: { id } });
    if (!serviceOrder) throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    return serviceOrder;
  }

  private async ensureDiagnosis(id: number) {
    const diagnosis = await this.diagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    return diagnosis;
  }

  private async ensureAgreement(id: number) {
    const agreement = await this.agreementRepository.findOne({ where: { id } });
    if (!agreement) throw new NotFoundException(`ServiceOrderAgreement with id ${id} not found`);
  }

  private async resolveNextSequence(manager: EntityManager, serviceOrderId: number) {
    const raw = await manager
      .getRepository(ServiceOrderAgreement)
      .createQueryBuilder('agreement')
      .select('MAX(agreement.sequenceNumber)', 'max')
      .where('agreement.serviceOrderId = :serviceOrderId', { serviceOrderId })
      .withDeleted()
      .getRawOne<{ max: string | null } | undefined>();
    return (Number(raw?.max ?? null) || 0) + 1;
  }

  private async buildProductItems(
    items: ServiceOrderAgreementProductItemDto[] | undefined,
    manager: EntityManager,
    serviceType?: ServiceType,
  ) {
    if (!items?.length) return [];
    const products = await manager.getRepository(Product).find({
      where: { id: In([...new Set(items.map((item) => Number(item.productId)))]) },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    return items.map((item) => {
      const product = productMap.get(Number(item.productId));
      if (!product) throw new NotFoundException(`Product with id ${item.productId} not found`);
      const quantity = Number(item.quantity ?? 1);
      const isZeroBillingProduct = serviceType === ServiceType.WARRANTY_SERVICE;
      const unitPrice = isZeroBillingProduct ? 0 : Number(item.unitPrice ?? (product as any).salePrice ?? 0);
      return manager.getRepository(ServiceOrderAgreementProduct).create({
        productId: product.id,
        productCodeSnapshot: (product as any).code ?? String(product.id),
        productNameSnapshot: (product as any).name ?? `Producto ${product.id}`,
        productDescriptionSnapshot: (product as any).description ?? null,
        quantity,
        unitPrice,
        lineTotal: Number((quantity * unitPrice).toFixed(2)),
        requiresPurchase: item.requiresPurchase ?? false,
        notes: item.notes ?? null,
        provenance: ServiceOrderAgreementLineProvenance.NEW,
        derivedFromAgreementProductItemId: null,
      });
    });
  }

  private async buildNewProductItems(
    items: ServiceOrderAgreementProductItemDto[] | undefined,
    manager: EntityManager,
    serviceType?: ServiceType,
  ) {
    return this.buildProductItems(items, manager, serviceType);
  }

  private buildTechnicalServiceItems(amount: number, serviceType?: ServiceType) {
    this.ensureTechnicalServiceAmount(amount);
    const isZeroBillingService =
      serviceType === ServiceType.CUSTOMER_SERVICE || serviceType === ServiceType.WARRANTY_SERVICE;
    const unitPrice = isZeroBillingService ? 0 : Number(amount.toFixed(2));
    return [
      this.agreementServiceItemRepository.create({
        serviceId: null,
        serviceCodeSnapshot: TECHNICAL_SERVICE_CODE,
        serviceNameSnapshot: TECHNICAL_SERVICE_NAME,
        serviceDescriptionSnapshot: TECHNICAL_SERVICE_NAME,
        estimatedHours: 1,
        unitPrice,
        lineTotal: Number(unitPrice.toFixed(2)),
        notes: null,
        provenance: ServiceOrderAgreementLineProvenance.NEW,
        derivedFromAgreementServiceItemId: null,
      }),
    ];
  }

  private async createAutomaticTechnicalServiceAgreement(serviceOrderId: number, reason?: string) {
    const serviceOrder = await this.ensureServiceOrder(serviceOrderId);
    const existingConfirmed = await this.agreementRepository.find({
      where: {
        serviceOrderId,
        status: ServiceOrderAgreementStatus.CONFIRMED,
      },
      relations: ['serviceItems'],
      order: { agreedAt: 'DESC', createdAt: 'DESC' },
    });

    const duplicatedAutomaticCharge = existingConfirmed.some((agreement) =>
      (agreement.serviceItems ?? []).some(
        (item) =>
          item.serviceCodeSnapshot === TECHNICAL_SERVICE_CODE &&
          Number(item.unitPrice ?? 0) === TECHNICAL_SERVICE_MINIMUM_AMOUNT,
      ),
    );
    if (duplicatedAutomaticCharge) {
      return existingConfirmed[0];
    }

    return this.agreementRepository.manager.transaction(async (manager) => {
      await this.supersedePrevious(manager, serviceOrder.id, ServiceOrderAgreementStatus.CONFIRMED);
      const saved = await manager.getRepository(ServiceOrderAgreement).save({
        serviceOrderId: serviceOrder.id,
        diagnosisId: null,
        sequenceNumber: await this.resolveNextSequence(manager, serviceOrder.id),
        status: ServiceOrderAgreementStatus.CONFIRMED,
        source: ServiceOrderAgreementSource.TECHNICAL_SERVICE_AUTO,
        totalAmount: TECHNICAL_SERVICE_MINIMUM_AMOUNT,
        notes: reason ?? 'Cobro automático de Servicio técnico por diagnóstico cerrado sin reparación',
        agreedAt: new Date(),
        agreedByUserId: null,
      });

      await this.persistServiceItems(
        manager,
        saved.id,
        this.buildTechnicalServiceItems(TECHNICAL_SERVICE_MINIMUM_AMOUNT, serviceOrder.serviceType),
      );
      return saved;
    });
  }

  private ensureTechnicalServiceAmount(value: number | undefined) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('technicalServiceAmount is required');
    }
    if (amount < TECHNICAL_SERVICE_MINIMUM_AMOUNT) {
      throw new BadRequestException(
        `technicalServiceAmount must be at least ${TECHNICAL_SERVICE_MINIMUM_AMOUNT}`,
      );
    }
  }

  private async loadCurrentProductItems(manager: EntityManager, agreementId: number) {
    return manager.getRepository(ServiceOrderAgreementProduct).find({ where: { serviceOrderAgreementId: agreementId } });
  }

  private async loadCurrentServiceItems(manager: EntityManager, agreementId: number) {
    return manager.getRepository(ServiceOrderAgreementServiceItem).find({ where: { serviceOrderAgreementId: agreementId } });
  }

  private async persistProductItems(manager: EntityManager, agreementId: number, items: ServiceOrderAgreementProduct[]) {
    if (!items.length) return;
    await manager.getRepository(ServiceOrderAgreementProduct).insert(
      items.map((item) => ({
        productId: item.productId,
        productCodeSnapshot: item.productCodeSnapshot,
        productNameSnapshot: item.productNameSnapshot,
        productDescriptionSnapshot: item.productDescriptionSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        requiresPurchase: item.requiresPurchase,
        notes: item.notes,
        provenance: item.provenance ?? ServiceOrderAgreementLineProvenance.NEW,
        derivedFromAgreementProductItemId: item.derivedFromAgreementProductItemId ?? null,
        serviceOrderAgreementId: agreementId,
      })),
    );
  }

  private async persistServiceItems(
    manager: EntityManager,
    agreementId: number,
    items: ServiceOrderAgreementServiceItem[],
  ) {
    if (!items.length) return;
    await manager.getRepository(ServiceOrderAgreementServiceItem).insert(
      items.map((item) => ({
        serviceId: item.serviceId,
        serviceCodeSnapshot: item.serviceCodeSnapshot,
        serviceNameSnapshot: item.serviceNameSnapshot,
        serviceDescriptionSnapshot: item.serviceDescriptionSnapshot,
        estimatedHours: item.estimatedHours,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        notes: item.notes,
        provenance: item.provenance ?? ServiceOrderAgreementLineProvenance.NEW,
        derivedFromAgreementServiceItemId: item.derivedFromAgreementServiceItemId ?? null,
        serviceOrderAgreementId: agreementId,
      })),
    );
  }

  private calculateTotalAmount(
    productItems: ServiceOrderAgreementProduct[] | undefined,
    serviceItems: ServiceOrderAgreementServiceItem[] | undefined,
  ) {
    const productTotal = (productItems ?? []).reduce((acc, item) => acc + Number(item.lineTotal ?? 0), 0);
    const serviceTotal = (serviceItems ?? []).reduce((acc, item) => acc + Number(item.lineTotal ?? 0), 0);
    return Number((productTotal + serviceTotal).toFixed(2));
  }

  private pickEffectiveAgreement(agreements: ServiceOrderAgreement[]): ServiceOrderAgreement | null {
    const sorted = [...agreements].sort((left, right) => {
      if ((right.sequenceNumber ?? 0) !== (left.sequenceNumber ?? 0)) {
        return (right.sequenceNumber ?? 0) - (left.sequenceNumber ?? 0);
      }
      return Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
    });
    const confirmed = sorted.find((agreement) => agreement.status === ServiceOrderAgreementStatus.CONFIRMED);
    if (confirmed) return confirmed;
    const draft = sorted.find((agreement) => agreement.status === ServiceOrderAgreementStatus.DRAFT);
    if (draft) return draft;
    return sorted[0] ?? null;
  }

  private async resolveDerivedBaseAgreement(
    serviceOrder: ServiceOrder,
    diagnosis: ServiceOrderDiagnosis | null,
    baseAgreementId: number,
  ) {
    if (serviceOrder.serviceType !== ServiceType.DIAGNOSIS || !diagnosis || diagnosis.sequenceNumber <= 1) {
      throw new BadRequestException('Derived agreements are only allowed for rediagnosis flows');
    }

    const baseAgreement = await this.agreementRepository.findOne({
      where: { id: baseAgreementId },
      relations: ['productItems', 'serviceItems'],
    });
    if (!baseAgreement || baseAgreement.serviceOrderId !== serviceOrder.id) {
      throw new BadRequestException('Base agreement does not belong to the provided service order');
    }
    if (baseAgreement.status !== ServiceOrderAgreementStatus.CONFIRMED) {
      throw new BadRequestException('Base agreement must be the latest confirmed active version');
    }

    const latestConfirmed = await this.agreementRepository.findOne({
      where: { serviceOrderId: serviceOrder.id, status: ServiceOrderAgreementStatus.CONFIRMED },
      relations: ['productItems', 'serviceItems'],
      order: { sequenceNumber: 'DESC', agreedAt: 'DESC', createdAt: 'DESC' },
    });
    if (!latestConfirmed || latestConfirmed.id !== baseAgreement.id) {
      throw new BadRequestException('Base agreement must be the latest confirmed active version');
    }

    return latestConfirmed;
  }

  private cloneInheritedProductItems(items: ServiceOrderAgreementProduct[], manager: EntityManager) {
    return items.map((item) =>
      manager.getRepository(ServiceOrderAgreementProduct).create({
        productId: item.productId,
        productCodeSnapshot: item.productCodeSnapshot,
        productNameSnapshot: item.productNameSnapshot,
        productDescriptionSnapshot: item.productDescriptionSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        requiresPurchase: item.requiresPurchase,
        notes: item.notes,
        provenance: ServiceOrderAgreementLineProvenance.INHERITED,
        derivedFromAgreementProductItemId: item.id,
      }),
    );
  }

  private cloneInheritedServiceItems(
    items: ServiceOrderAgreementServiceItem[],
    manager: EntityManager,
    serviceType?: ServiceType,
    technicalServiceAmount?: number,
  ) {
    return items.map((item) => {
      const shouldOverrideTechnicalAmount =
        technicalServiceAmount !== undefined && item.serviceCodeSnapshot === TECHNICAL_SERVICE_CODE;
      const unitPrice = shouldOverrideTechnicalAmount
        ? this.resolveTechnicalServiceUnitPrice(technicalServiceAmount, serviceType)
        : Number(item.unitPrice ?? 0);

      return manager.getRepository(ServiceOrderAgreementServiceItem).create({
        serviceId: item.serviceId,
        serviceCodeSnapshot: item.serviceCodeSnapshot,
        serviceNameSnapshot: item.serviceNameSnapshot,
        serviceDescriptionSnapshot: item.serviceDescriptionSnapshot,
        estimatedHours: item.estimatedHours,
        unitPrice,
        lineTotal: Number(unitPrice.toFixed(2)),
        notes: item.notes,
        provenance: ServiceOrderAgreementLineProvenance.INHERITED,
        derivedFromAgreementServiceItemId: item.id,
      });
    });
  }

  private async upsertTechnicalServiceAmount(
    manager: EntityManager,
    agreement: ServiceOrderAgreement,
    items: ServiceOrderAgreementServiceItem[],
    amount: number,
    serviceType?: ServiceType,
  ) {
    const technicalItem = items.find((item) => item.serviceCodeSnapshot === TECHNICAL_SERVICE_CODE);
    if (!technicalItem) {
      if (agreement.derivedFromAgreementId) {
        throw new BadRequestException('Agreement does not contain a technical service line');
      }

      const [newTechnicalItem] = this.buildTechnicalServiceItems(amount, serviceType);
      await this.persistServiceItems(manager, agreement.id, [newTechnicalItem]);
      return [...items, newTechnicalItem];
    }

    const isInherited = technicalItem.provenance === ServiceOrderAgreementLineProvenance.INHERITED;
    if (agreement.derivedFromAgreementId && !isInherited) {
      throw new BadRequestException('Only the inherited technical service line can be edited');
    }

    const unitPrice = this.resolveTechnicalServiceUnitPrice(amount, serviceType);
    await manager.getRepository(ServiceOrderAgreementServiceItem).update(technicalItem.id, {
      unitPrice,
      lineTotal: Number(unitPrice.toFixed(2)),
    });

    return items.map((item) =>
      item.id === technicalItem.id
        ? { ...item, unitPrice, lineTotal: Number(unitPrice.toFixed(2)) }
        : item,
    );
  }

  private resolveTechnicalServiceUnitPrice(amount: number, serviceType?: ServiceType) {
    this.ensureTechnicalServiceAmount(amount);
    const isZeroBillingService =
      serviceType === ServiceType.CUSTOMER_SERVICE || serviceType === ServiceType.WARRANTY_SERVICE;
    return isZeroBillingService ? 0 : Number(amount.toFixed(2));
  }

  private ensureCreatePayloadCompatibility(
    dto: CreateServiceOrderAgreementDto,
    isDerivedAgreement: boolean,
  ) {
    if (isDerivedAgreement) {
      if (dto.products?.length) {
        throw new BadRequestException('products is not allowed when baseAgreementId is provided');
      }
      return;
    }

    if (dto.newProducts?.length) {
      throw new BadRequestException('newProducts is only allowed for derived agreements');
    }
  }

  private ensureNoLegacyUpdateFields(dto: Record<string, unknown>) {
    const forbiddenFields = ['products', 'serviceOrderId', 'diagnosisId', 'sequenceNumber', 'source', 'status', 'baseAgreementId'];
    const hasForbiddenField = forbiddenFields.some((field) => dto[field] !== undefined);
    if (hasForbiddenField) {
      throw new BadRequestException('Inherited lines cannot be edited or removed');
    }
  }

  private serializeAgreement(agreement: ServiceOrderAgreement) {
    return {
      ...agreement,
      derivedFromAgreementId: agreement.derivedFromAgreementId ?? null,
      productItems: (agreement.productItems ?? []).map((item) => this.serializeProductItem(item)),
      serviceItems: (agreement.serviceItems ?? []).map((item) => this.serializeServiceItem(item)),
    };
  }

  private serializeProductItem(item: ServiceOrderAgreementProduct) {
    const provenance = item.provenance ?? ServiceOrderAgreementLineProvenance.NEW;
    const isInherited = provenance === ServiceOrderAgreementLineProvenance.INHERITED;
    return {
      ...item,
      provenance,
      derivedFromItemId: item.derivedFromAgreementProductItemId ?? null,
      isInherited,
      canEdit: !isInherited,
      canDelete: !isInherited,
    };
  }

  private serializeServiceItem(item: ServiceOrderAgreementServiceItem) {
    const provenance = item.provenance ?? ServiceOrderAgreementLineProvenance.NEW;
    const isInherited = provenance === ServiceOrderAgreementLineProvenance.INHERITED;
    const canEdit = !isInherited || item.serviceCodeSnapshot === TECHNICAL_SERVICE_CODE;
    return {
      ...item,
      provenance,
      derivedFromItemId: item.derivedFromAgreementServiceItemId ?? null,
      isInherited,
      canEdit,
      canDelete: !isInherited,
    };
  }

  private parsePositiveNumber(
    value: number | string | undefined,
    fallback: number | undefined,
    field: string,
    max?: number,
  ): number {
    if (value === undefined || value === null || value === '') {
      return fallback ?? (() => {
        throw new BadRequestException(`${field} is required`);
      })();
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }

    const normalized = Math.floor(parsed);
    if (max && normalized > max) {
      return max;
    }

    return normalized;
  }

  private parseEnumList<T extends string>(
    value: string | undefined,
    enumObject: Record<string, string>,
    field: string,
  ): T[] | undefined {
    if (!value) return undefined;
    const values = value.split(',').map((entry) => entry.trim()).filter(Boolean) as T[];
    const allowed = Object.values(enumObject);
    const invalid = values.filter((entry) => !allowed.includes(entry));
    if (invalid.length) {
      throw new BadRequestException(`${field} contains invalid values: ${invalid.join(', ')}`);
    }
    return values;
  }

  private ensureIds(ids: number[]) {
    if (!ids?.length) {
      throw new BadRequestException('No ids provided');
    }
  }
}


