import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { Service } from '../../service-catalog/entities/service.entity';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderItemStatus, ServiceType } from '../enums';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderItemService } from '../services/service-order-item.service';
import { ApproveClientServiceOrderQuoteDto } from './dto/approve-client-service-quote.dto';
import { CreateServiceOrderQuoteDto } from './dto/create-service-quote.dto';
import { RejectClientServiceOrderQuoteDto } from './dto/reject-client-service-quote.dto';
import { ResubmitServiceOrderQuoteDto } from './dto/resubmit-service-quote.dto';
import { SendToClientServiceOrderQuoteDto } from './dto/send-to-client-service-quote.dto';
import { ServiceOrderQuoteProductItemDto } from './dto/service-quote-product-item.dto';
import { ServiceOrderQuoteServiceItemDto } from './dto/service-quote-service-item.dto';
import { UpdateServiceOrderQuoteDto } from './dto/update-service-quote.dto';
import { ServiceOrderQuoteProduct } from './entities/service-quote-product.entity';
import { ServiceOrderQuoteServiceItem } from './entities/service-quote-service-item.entity';
import { ServiceOrderQuote } from './entities/service-quote.entity';
import { ServiceOrderQuoteStatus } from './service-quote-status.enum';

type FindQuotesQuery = {
  page?: number | string;
  limit?: number | string;
  serviceOrderItemId?: number | string;
  status?: string;
  withDeleted?: string;
};

@Injectable()
export class ServiceOrderQuotesService {
  private static readonly DIAGNOSTIC_SERVICE_CODE = 'DIAGNOSIS_FEE';

  constructor(
    @InjectRepository(ServiceOrderQuote)
    private readonly quoteRepository: Repository<ServiceOrderQuote>,
    @InjectRepository(ServiceOrderQuoteProduct)
    private readonly quoteProductRepository: Repository<ServiceOrderQuoteProduct>,
    @InjectRepository(ServiceOrderQuoteServiceItem)
    private readonly quoteServiceItemRepository: Repository<ServiceOrderQuoteServiceItem>,
    @InjectRepository(ServiceOrderItem)
    private readonly serviceOrderItemRepository: Repository<ServiceOrderItem>,
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly diagnosisRepository: Repository<ServiceOrderDiagnosis>,
    private readonly serviceOrderItemService: ServiceOrderItemService,
  ) {}

  async findAll(query: FindQuotesQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<ServiceOrderQuoteStatus>(query.status, ServiceOrderQuoteStatus, 'status');
    const qb = this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.productItems', 'productItems')
      .leftJoinAndSelect('productItems.product', 'product')
      .leftJoinAndSelect('quote.serviceItems', 'serviceItems')
      .leftJoinAndSelect('serviceItems.service', 'service')
      .leftJoinAndSelect('quote.serviceOrderItem', 'serviceOrderItem')
      .leftJoinAndSelect('serviceOrderItem.serviceOrder', 'serviceOrder')
      .orderBy('quote.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.withDeleted === 'true') qb.withDeleted();
    if (query.serviceOrderItemId !== undefined) {
      qb.andWhere('quote.serviceOrderItemId = :serviceOrderItemId', {
        serviceOrderItemId: this.parsePositiveNumber(query.serviceOrderItemId, undefined, 'serviceOrderItemId'),
      });
    }
    if (statuses?.length) qb.andWhere('quote.status IN (:...statuses)', { statuses });

    const [data, total] = await qb.getManyAndCount();
    return { data: data.map((quote) => this.normalizeQuoteStatus(quote)), total, page, limit };
  }

  async findOne(id: number, withDeleted = false) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: [
        'serviceOrderItem',
        'serviceOrderItem.serviceOrder',
        'productItems',
        'productItems.product',
        'serviceItems',
        'serviceItems.service',
      ],
      withDeleted,
    });
    if (!quote) throw new NotFoundException(`ServiceOrderQuote with id ${id} not found`);
    return this.normalizeQuoteStatus(quote);
  }

  async create(dto: CreateServiceOrderQuoteDto) {
    const serviceOrderItem = await this.ensureServiceOrderItem(dto.serviceOrderItemId);
    const diagnosis = dto.diagnosisId ? await this.ensureDiagnosis(dto.diagnosisId) : null;
    if (diagnosis && diagnosis.serviceOrderItemId !== serviceOrderItem.id) {
      throw new BadRequestException('Diagnosis does not belong to the provided service order item');
    }

    const quote = await this.quoteRepository.manager.transaction(async (manager) => {
      const productItems = await this.buildProductItems(dto.products, manager, serviceOrderItem.serviceType);
      const serviceItems = await this.buildServiceItems(dto.services, manager, serviceOrderItem.serviceType);
      await manager
        .getRepository(ServiceOrderQuote)
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderQuoteStatus.ARCHIVED })
        .where('service_order_item_id = :serviceOrderItemId', { serviceOrderItemId: serviceOrderItem.id })
        .andWhere('status = :status', { status: ServiceOrderQuoteStatus.CURRENT })
        .execute();

      const saved = await manager.getRepository(ServiceOrderQuote).save({
        serviceOrderItemId: serviceOrderItem.id,
        diagnosisId: diagnosis?.id ?? null,
        sequenceNumber: dto.sequenceNumber ?? (await this.resolveNextSequence(manager, serviceOrderItem.id)),
        status: ServiceOrderQuoteStatus.CURRENT,
        totalAmount: this.calculateTotalAmount(productItems, serviceItems),
        notes: dto.notes ?? null,
      });

      await this.persistProductItems(manager, saved.id, productItems);
      await this.persistServiceItems(manager, saved.id, serviceItems);
      return saved;
    });

    await this.transitionItemStatus(serviceOrderItem.id, ServiceOrderItemStatus.QUOTED, [
      ServiceOrderItemStatus.DIAGNOSED,
      ServiceOrderItemStatus.ASSIGNED,
    ]);

    if (this.shouldAutoApproveClientQuote(serviceOrderItem.serviceType)) {
      await this.quoteRepository.update(quote.id, {
        clientApprovedAt: new Date(),
        status: ServiceOrderQuoteStatus.CLIENT_APPROVED,
      });
      await this.transitionItemStatus(serviceOrderItem.id, ServiceOrderItemStatus.CLIENT_APPROVED, [
        ServiceOrderItemStatus.QUOTED,
      ]);
      if (serviceOrderItem.serviceType === ServiceType.STANDARD_SERVICE) {
        await this.transitionItemStatus(serviceOrderItem.id, ServiceOrderItemStatus.READY_FOR_REPAIR, [
          ServiceOrderItemStatus.CLIENT_APPROVED,
        ]);
      }
    }

    return this.findOne(quote.id);
  }

  async update(id: number, dto: UpdateServiceOrderQuoteDto) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['serviceOrderItem', 'productItems', 'serviceItems'],
    });
    if (!quote) throw new NotFoundException(`ServiceOrderQuote with id ${id} not found`);
    if (quote.deletedAt) throw new BadRequestException('Cannot update a deleted quote');

    const serviceOrderItem = dto.serviceOrderItemId
      ? await this.ensureServiceOrderItem(dto.serviceOrderItemId)
      : quote.serviceOrderItem;

    if (dto.diagnosisId !== undefined) {
      if (dto.diagnosisId === null) {
        quote.diagnosisId = null;
      } else {
        const diagnosis = await this.ensureDiagnosis(dto.diagnosisId);
        if (diagnosis.serviceOrderItemId !== serviceOrderItem.id) {
          throw new BadRequestException('Diagnosis does not belong to the provided service order item');
        }
        quote.diagnosisId = diagnosis.id;
      }
    }

    return this.quoteRepository.manager.transaction(async (manager) => {
      if (dto.products) {
        await manager.getRepository(ServiceOrderQuoteProduct).delete({ serviceOrderQuoteId: quote.id });
        await this.persistProductItems(
          manager,
          quote.id,
          await this.buildProductItems(dto.products, manager, serviceOrderItem.serviceType),
        );
      }
      if (dto.services) {
        await manager.getRepository(ServiceOrderQuoteServiceItem).delete({ serviceOrderQuoteId: quote.id });
        await this.persistServiceItems(
          manager,
          quote.id,
          await this.buildServiceItems(dto.services, manager, serviceOrderItem.serviceType),
        );
      }

      await manager.getRepository(ServiceOrderQuote).update(quote.id, {
        serviceOrderItemId: serviceOrderItem.id,
        diagnosisId: quote.diagnosisId,
        sequenceNumber: dto.sequenceNumber ?? quote.sequenceNumber,
        status: dto.status ?? quote.status,
        notes: dto.notes ?? quote.notes,
      });
      return this.findOne(quote.id);
    });
  }

  async softDelete(id: number) {
    await this.ensureQuote(id);
    await this.quoteRepository.softDelete(id);
    return { ok: true, message: `ServiceOrderQuote ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.quoteRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} service order quotes deleted successfully` };
  }

  async restore(id: number) {
    const quote = await this.quoteRepository.findOne({ where: { id }, withDeleted: true });
    if (!quote) throw new NotFoundException(`ServiceOrderQuote with id ${id} not found`);
    if (!quote.deletedAt) return { ok: true, message: 'ServiceOrderQuote already active' };
    await this.quoteRepository.restore(id);
    return { ok: true, message: `ServiceOrderQuote ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    const existing = await this.quoteRepository.find({ where: { id: In(ids) }, withDeleted: true });
    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) throw new NotFoundException('No service order quotes found to restore');
    await this.quoteRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} service order quotes restored successfully` };
  }

  async resubmitQuote(id: number, dto: ResubmitServiceOrderQuoteDto) {
    const quote = await this.findEditableQuote(id, ['serviceOrderItem']);
    if (!quote.clientRejectedAt) {
      throw new BadRequestException('Quote can only be resubmitted after client rejection');
    }
    return this.rebuildQuote(id, dto, quote.serviceOrderItem?.serviceType ?? ServiceType.DIAGNOSIS);
  }

  async sendToClient(quoteId: number, notes?: string) {
    const quote = await this.findEditableQuote(quoteId);
    if (![ServiceOrderQuoteStatus.CURRENT, ServiceOrderQuoteStatus.CLIENT_REJECTED].includes(quote.status)) {
      throw new BadRequestException('Quote is not ready to be sent to the client');
    }
    await this.quoteRepository.update(quoteId, {
      sentToClientAt: new Date(),
      notes: notes ?? quote.notes,
      status: ServiceOrderQuoteStatus.AWAITING_CLIENT_RESPONSE,
    });
    await this.transitionItemStatus(quote.serviceOrderItemId, ServiceOrderItemStatus.SENT_TO_CLIENT, [ServiceOrderItemStatus.QUOTED]);
    await this.transitionItemStatus(quote.serviceOrderItemId, ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE, [ServiceOrderItemStatus.SENT_TO_CLIENT]);
    return this.findOne(quoteId);
  }

  async approveByClient(quoteId: number, notes?: string) {
    const quote = await this.findEditableQuote(quoteId);
    if (!quote.sentToClientAt) throw new BadRequestException('Quote has not been sent to client');
    if (quote.clientApprovedAt) throw new BadRequestException('Quote already approved by client');
    if (quote.clientRejectedAt) throw new BadRequestException('Quote already rejected by client');
    await this.quoteRepository.update(quoteId, {
      clientApprovedAt: new Date(),
      clientRejectedAt: null,
      clientNotes: notes ?? null,
      status: ServiceOrderQuoteStatus.CLIENT_APPROVED,
    });
    await this.transitionItemStatus(quote.serviceOrderItemId, ServiceOrderItemStatus.CLIENT_APPROVED, [
      ServiceOrderItemStatus.SENT_TO_CLIENT,
      ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE,
    ]);
    return this.findOne(quoteId);
  }

  async rejectByClient(quoteId: number, notes?: string) {
    const quote = await this.findEditableQuote(quoteId, ['serviceOrderItem', 'serviceItems', 'productItems']);
    if (!quote.sentToClientAt) throw new BadRequestException('Quote has not been sent to client');
    if (quote.clientApprovedAt) throw new BadRequestException('Quote already approved by client');
    if (quote.clientRejectedAt) throw new BadRequestException('Quote already rejected by client');
    await this.quoteRepository.update(quoteId, {
      clientRejectedAt: new Date(),
      clientApprovedAt: null,
      clientNotes: notes ?? null,
      status: ServiceOrderQuoteStatus.CLIENT_REJECTED,
    });
    await this.transitionItemStatus(quote.serviceOrderItemId, ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT, [
      ServiceOrderItemStatus.SENT_TO_CLIENT,
      ServiceOrderItemStatus.AWAITING_CLIENT_RESPONSE,
    ]);
    await this.createDiagnosticFeeQuoteAfterClientRejection(quote);
    return this.findOne(quoteId);
  }

  async resubmitAfterClientRejection(id: number, dto: ResubmitServiceOrderQuoteDto) {
    const quote = await this.findEditableQuote(id, ['serviceOrderItem']);
    if (!quote.clientRejectedAt) throw new BadRequestException('Quote can only be resubmitted after client rejection');
    return this.rebuildQuote(id, dto, quote.serviceOrderItem?.serviceType ?? ServiceType.DIAGNOSIS);
  }

  private async rebuildQuote(
    quoteId: number,
    dto: ResubmitServiceOrderQuoteDto,
    serviceType: ServiceType,
  ) {
    return this.quoteRepository.manager.transaction(async (manager) => {
      if (dto.products) {
        await manager.getRepository(ServiceOrderQuoteProduct).delete({ serviceOrderQuoteId: quoteId });
        await this.persistProductItems(manager, quoteId, await this.buildProductItems(dto.products, manager, serviceType));
      }
      if (dto.services) {
        await manager.getRepository(ServiceOrderQuoteServiceItem).delete({ serviceOrderQuoteId: quoteId });
        await this.persistServiceItems(
          manager,
          quoteId,
          await this.buildServiceItems(dto.services, manager, serviceType),
        );
      }

      await manager.getRepository(ServiceOrderQuote).update(quoteId, {
        sequenceNumber: () => 'sequence_number + 1' as any,
        notes: dto.notes ?? null,
        sentToClientAt: null,
        clientApprovedAt: null,
        clientRejectedAt: null,
        clientNotes: null,
        status: ServiceOrderQuoteStatus.CURRENT,
      });

      const quote = await manager.getRepository(ServiceOrderQuote).findOne({ where: { id: quoteId } });
      if (quote?.serviceOrderItemId) {
        await this.transitionItemStatus(quote.serviceOrderItemId, ServiceOrderItemStatus.QUOTED, [
          ServiceOrderItemStatus.CLIENT_REJECTED,
          ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT,
        ]);
      }
      return this.findOne(quoteId);
    });
  }

  private normalizeQuoteStatus(quote: ServiceOrderQuote) {
    if (quote.clientApprovedAt) quote.status = ServiceOrderQuoteStatus.CLIENT_APPROVED;
    else if (quote.clientRejectedAt) quote.status = ServiceOrderQuoteStatus.CLIENT_REJECTED;
    else if (quote.sentToClientAt) quote.status = ServiceOrderQuoteStatus.AWAITING_CLIENT_RESPONSE;
    return quote;
  }

  private async findEditableQuote(id: number, relations?: string[]) {
    const quote = await this.quoteRepository.findOne({ where: { id }, relations });
    if (!quote) throw new NotFoundException(`ServiceOrderQuote with id ${id} not found`);
    if (quote.deletedAt) throw new BadRequestException('Cannot operate on a deleted quote');
    return quote;
  }

  private async ensureServiceOrderItem(id: number) {
    const item = await this.serviceOrderItemRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`ServiceOrderItem with id ${id} not found`);
    return item;
  }

  private async ensureDiagnosis(id: number) {
    const diagnosis = await this.diagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    return diagnosis;
  }

  private async ensureQuote(id: number) {
    const quote = await this.quoteRepository.findOne({ where: { id } });
    if (!quote) throw new NotFoundException(`ServiceOrderQuote with id ${id} not found`);
  }

  private async resolveNextSequence(manager: EntityManager, serviceOrderItemId: number) {
    const raw = await manager
      .getRepository(ServiceOrderQuote)
      .createQueryBuilder('quote')
      .select('MAX(quote.sequenceNumber)', 'max')
      .where('quote.serviceOrderItemId = :serviceOrderItemId', { serviceOrderItemId })
      .withDeleted()
      .getRawOne<{ max: string | null } | undefined>();
    return (Number(raw?.max ?? null) || 0) + 1;
  }

  private async buildProductItems(
    items: ServiceOrderQuoteProductItemDto[] | undefined,
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
      const isWarrantyService = serviceType === ServiceType.WARRANTY_SERVICE;
      const unitPrice = isWarrantyService ? 0 : Number(item.unitPrice ?? (product as any).salePrice ?? 0);
      return manager.getRepository(ServiceOrderQuoteProduct).create({
        productId: product.id,
        productCodeSnapshot: (product as any).code ?? String(product.id),
        productNameSnapshot: (product as any).name ?? `Producto ${product.id}`,
        productDescriptionSnapshot: (product as any).description ?? null,
        quantity,
        unitPrice,
        lineTotal: Number((quantity * unitPrice).toFixed(2)),
        requiresPurchase: item.requiresPurchase ?? false,
        notes: item.notes ?? null,
      });
    });
  }

  private async buildServiceItems(
    items: ServiceOrderQuoteServiceItemDto[] | undefined,
    manager: EntityManager,
    serviceType?: ServiceType,
  ) {
    if (!items?.length) return [];
    const services = await manager.getRepository(Service).find({
      where: { id: In([...new Set(items.map((item) => Number(item.serviceId)))]) },
    });
    const serviceMap = new Map(services.map((service) => [service.id, service]));
    return items.map((item) => {
      const service = serviceMap.get(Number(item.serviceId));
      if (!service) throw new NotFoundException(`Service with id ${item.serviceId} not found`);
      const estimatedHours = Number((((service as any).estimatedDurationMinutes ?? 60) / 60).toFixed(2));
      const isZeroBillingService =
        serviceType === ServiceType.CUSTOMER_SERVICE || serviceType === ServiceType.WARRANTY_SERVICE;
      const unitPrice = isZeroBillingService ? 0 : Number((service as any).price ?? 0);
      return manager.getRepository(ServiceOrderQuoteServiceItem).create({
        serviceId: service.id,
        serviceCodeSnapshot: (service as any).code ?? String(service.id),
        serviceNameSnapshot: (service as any).name ?? `Servicio ${service.id}`,
        serviceDescriptionSnapshot: (service as any).description ?? null,
        estimatedHours,
        unitPrice,
        lineTotal: Number(unitPrice.toFixed(2)),
        notes: item.notes ?? null,
      });
    });
  }

  private async createDiagnosticFeeQuoteAfterClientRejection(rejectedQuote: ServiceOrderQuote) {
    const item = rejectedQuote.serviceOrderItem;
    if (!item || item.serviceType !== ServiceType.DIAGNOSIS) {
      return;
    }

    const diagnosticService = await this.quoteRepository.manager.getRepository(Service).findOne({
      where: { code: ServiceOrderQuotesService.DIAGNOSTIC_SERVICE_CODE },
    });
    if (!diagnosticService) {
      throw new NotFoundException(
        `Service "${ServiceOrderQuotesService.DIAGNOSTIC_SERVICE_CODE}" no encontrado. Ejecuta el seeder.`,
      );
    }

    const alreadyDiagnosisOnlyQuote =
      (rejectedQuote.productItems?.length ?? 0) === 0 &&
      (rejectedQuote.serviceItems?.length ?? 0) > 0 &&
      rejectedQuote.serviceItems.every((line) => Number(line.serviceId) === Number(diagnosticService.id));
    if (alreadyDiagnosisOnlyQuote) {
      return;
    }

    await this.quoteRepository.manager.transaction(async (manager) => {
      await manager
        .getRepository(ServiceOrderQuote)
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderQuoteStatus.ARCHIVED })
        .where('service_order_item_id = :serviceOrderItemId', { serviceOrderItemId: rejectedQuote.serviceOrderItemId })
        .andWhere('status = :status', { status: ServiceOrderQuoteStatus.CURRENT })
        .execute();

      const feeLine = manager.getRepository(ServiceOrderQuoteServiceItem).create({
        serviceId: diagnosticService.id,
        serviceCodeSnapshot: (diagnosticService as any).code ?? String(diagnosticService.id),
        serviceNameSnapshot: (diagnosticService as any).name ?? `Servicio ${diagnosticService.id}`,
        serviceDescriptionSnapshot: (diagnosticService as any).description ?? null,
        estimatedHours: Number((((diagnosticService as any).estimatedDurationMinutes ?? 60) / 60).toFixed(2)),
        unitPrice: Number((diagnosticService as any).price ?? 0),
        lineTotal: Number(Number((diagnosticService as any).price ?? 0).toFixed(2)),
        notes: 'Cobro por diagnóstico tras rechazo de cotización',
      });

      const savedQuote = await manager.getRepository(ServiceOrderQuote).save({
        serviceOrderItemId: rejectedQuote.serviceOrderItemId,
        diagnosisId: rejectedQuote.diagnosisId ?? null,
        sequenceNumber: await this.resolveNextSequence(manager, rejectedQuote.serviceOrderItemId),
        status: ServiceOrderQuoteStatus.CLIENT_APPROVED,
        totalAmount: this.calculateTotalAmount([], [feeLine]),
        notes: `Cotización final de diagnóstico derivada del rechazo de la cotización #${rejectedQuote.sequenceNumber}`,
        clientApprovedAt: new Date(),
      });

      await this.persistServiceItems(manager, savedQuote.id, [feeLine]);
    });
  }

  private async persistProductItems(manager: EntityManager, serviceOrderQuoteId: number, items: ServiceOrderQuoteProduct[]) {
    if (!items.length) return;
    await manager.getRepository(ServiceOrderQuoteProduct).insert(
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
        serviceOrderQuoteId,
      })),
    );
  }

  private async persistServiceItems(manager: EntityManager, serviceOrderQuoteId: number, items: ServiceOrderQuoteServiceItem[]) {
    if (!items.length) return;
    await manager.getRepository(ServiceOrderQuoteServiceItem).insert(
      items.map((item) => ({
        serviceId: item.serviceId,
        serviceCodeSnapshot: item.serviceCodeSnapshot,
        serviceNameSnapshot: item.serviceNameSnapshot,
        serviceDescriptionSnapshot: item.serviceDescriptionSnapshot,
        estimatedHours: item.estimatedHours,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        notes: item.notes,
        serviceOrderQuoteId,
      })),
    );
  }

  private calculateTotalAmount(
    productItems: ServiceOrderQuoteProduct[] | undefined,
    serviceItems: ServiceOrderQuoteServiceItem[] | undefined,
  ) {
    const productTotal = productItems?.reduce((acc, item) => acc + Number(item.lineTotal ?? 0), 0) ?? 0;
    const serviceTotal = serviceItems?.reduce((acc, item) => acc + Number(item.lineTotal ?? 0), 0) ?? 0;
    return Number((productTotal + serviceTotal).toFixed(2));
  }

  private shouldAutoApproveClientQuote(serviceType: ServiceType): boolean {
    return [ServiceType.STANDARD_SERVICE, ServiceType.WARRANTY_SERVICE].includes(serviceType);
  }

  private async transitionItemStatus(
    serviceOrderItemId: number | null,
    targetStatus: ServiceOrderItemStatus,
    allowedStatuses: ServiceOrderItemStatus[],
  ) {
    if (!serviceOrderItemId) return;
    const item = await this.serviceOrderItemRepository.findOne({ where: { id: serviceOrderItemId } });
    if (!item || item.status === targetStatus || !allowedStatuses.includes(item.status)) return;
    await this.serviceOrderItemService.changeStatus(serviceOrderItemId, targetStatus);
  }

  private parsePositiveNumber(
    value: number | string | undefined,
    fallback: number | undefined,
    field: string,
    max?: number,
  ) {
    if (value === undefined || value === null || value === '') {
      if (fallback !== undefined) return fallback;
      throw new BadRequestException(`${field} is required`);
    }
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new BadRequestException(`${field} must be a positive number`);
    return max && parsed > max ? max : parsed;
  }

  private parseEnumList<T extends string>(value: string | undefined, enumObject: Record<string, string>, field: string) {
    if (!value) return undefined;
    const values = value.split(',').map((entry) => entry.trim()).filter(Boolean) as T[];
    const allowed = Object.values(enumObject);
    const invalid = values.filter((entry) => !allowed.includes(entry));
    if (invalid.length) throw new BadRequestException(`${field} contains invalid values: ${invalid.join(', ')}`);
    return values;
  }

  private ensureIds(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');
  }
}
