import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteProduct } from './entities/quote-product.entity';
import { QuoteServiceItem } from './entities/quote-service-item.entity';
import { Service } from '../../service-catalog/entities/service.entity';
import { TicketItem } from '../entities/ticket-item.entity';
import { TicketItemDiagnosis } from '../diagnostics/entities/ticket-item-diagnosis.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QuoteStatus } from './quote-status.enum';
import { QuoteProductItemDto } from './dto/quote-product-item.dto';
import { QuoteServiceItemDto } from './dto/quote-service-item.dto';
import { ServiceType, TicketItemStatus } from '../enums';
import { TicketItemService } from '../services/ticket-item.service';
import { User } from '../../users/entities/user.entity';
import { hasRoleName, SUPERVISOR_ROLE_NAMES } from '../../common/constants/role-names';

type FindQuotesQuery = {
  page?: number | string;
  limit?: number | string;
  ticketItemId?: number | string;
  status?: string;
  withDeleted?: string;
  supervisorId?: number | string;
  assignedToMe?: string;
};

@Injectable()
export class QuotesService {
  private static readonly DIAGNOSTIC_SERVICE_CODE = 'DIAGNOSIS_FEE';
  constructor(
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    @InjectRepository(TicketItemDiagnosis)
    private readonly diagnosisRepository: Repository<TicketItemDiagnosis>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ticketItemService: TicketItemService,
  ) {}

  async findAll(query: FindQuotesQuery, currentUserId?: number) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<QuoteStatus>(query.status, QuoteStatus, 'status');

    const qb = this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.productItems', 'productItems')
      .leftJoinAndSelect('productItems.product', 'product')
      .leftJoinAndSelect('quote.serviceItems', 'serviceItems')
      .leftJoinAndSelect('serviceItems.service', 'service')
      .leftJoinAndSelect('quote.ticketItem', 'ticketItem')
      .leftJoinAndSelect('ticketItem.ticket', 'ticket')
      .orderBy('quote.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.withDeleted === 'true') {
      qb.withDeleted();
    }

    if (query.ticketItemId !== undefined) {
      const ticketItemId = this.parsePositiveNumber(
        query.ticketItemId,
        undefined,
        'ticketItemId',
      );
      qb.andWhere('quote.ticketItemId = :ticketItemId', { ticketItemId });
    }

    if (statuses?.length) {
      qb.andWhere('quote.status IN (:...statuses)', { statuses });
    }

    let supervisorId: number | undefined;
    if (query.assignedToMe === 'true') {
      if (!currentUserId) {
        throw new BadRequestException('No se puede filtrar por assignedToMe sin usuario autenticado');
      }
      supervisorId = currentUserId;
    } else if (query.supervisorId !== undefined) {
      supervisorId = this.parsePositiveNumber(query.supervisorId, undefined, 'supervisorId');
    }

    if (supervisorId !== undefined) {
      qb.andWhere('ticketItem.assignedToSupervisorId = :supervisorId', { supervisorId });
    }

    const [data, total] = await qb.getManyAndCount();
    const normalized = data.map((quote) => this.normalizeQuoteStatus(quote));
    return { data: normalized, total, page, limit };
  }

  async findOne(id: number, withDeleted = false) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['ticketItem', 'ticketItem.ticket', 'productItems', 'productItems.product', 'serviceItems', 'serviceItems.service'],
      withDeleted,
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
    }

    return this.normalizeQuoteStatus(quote);
  }

  private normalizeQuoteStatus(quote: Quote): Quote {
    if (quote.clientApprovedAt) {
      quote.status = QuoteStatus.CLIENT_APPROVED;
      return quote;
    }
    if (quote.clientRejectedAt) {
      quote.status = QuoteStatus.CLIENT_REJECTED;
      return quote;
    }
    if (quote.sentToClientAt) {
      quote.status = QuoteStatus.AWAITING_CLIENT_RESPONSE;
    }
    return quote;
  }

  async create(dto: CreateQuoteDto) {
    const ticketItem = dto.ticketItemId ? await this.ensureTicketItem(dto.ticketItemId) : null;
    const diagnosis = dto.diagnosisId ? await this.ensureDiagnosis(dto.diagnosisId) : null;

    if (diagnosis && ticketItem && diagnosis.ticketItemId !== ticketItem.id) {
      throw new BadRequestException('Diagnosis does not belong to provided ticket item');
    }

    const owningTicketItemId = ticketItem?.id ?? diagnosis?.ticketItemId ?? null;

    const quote = await this.quoteRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Quote);
      const productItems = await this.buildProductItems(dto.products, manager);
      const servicePayload = ticketItem?.serviceType === ServiceType.DIAGNOSIS
        ? await this.ensureDiagnosticServiceItem(manager, dto.services)
        : dto.services;
      const serviceItems = await this.buildServiceItems(servicePayload, manager);
      const totalAmount = this.calculateTotalAmount(productItems, serviceItems);
      const sequenceNumber = owningTicketItemId
        ? dto.sequenceNumber ?? (await this.resolveNextSequence(repo, owningTicketItemId))
        : dto.sequenceNumber ?? 1;

      if (owningTicketItemId) {
        await repo
          .createQueryBuilder()
          .update()
          .set({ status: QuoteStatus.ARCHIVED })
          .where('ticket_item_id = :ticketItemId', { ticketItemId: owningTicketItemId })
          .andWhere('status = :status', { status: QuoteStatus.CURRENT })
          .execute();
      }

      // Determine initial status based on service type
      // For DIAGNOSIS services, quote needs supervisor approval
      // For STANDARD_SERVICE, quote is auto-approved (handled at TicketItem level)
      const initialStatus = ticketItem?.serviceType === 'DIAGNOSIS'
        ? QuoteStatus.PENDING_SUPERVISOR_APPROVAL
        : QuoteStatus.CURRENT;

      const entity = repo.create({
        ticketItemId: owningTicketItemId,
        diagnosisId: diagnosis?.id ?? null,
        sequenceNumber: sequenceNumber ?? 1,
        status: initialStatus,
        totalAmount,
        currency: dto.currency ?? 'PEN',
        notes: dto.notes ?? null,
      });
      const saved = await repo.save(entity);
      await this.persistProductItems(manager, saved.id, productItems);
      await this.persistServiceItems(manager, saved.id, serviceItems);
      saved.productItems = productItems.map((item) => ({ ...item, quoteId: saved.id } as QuoteProduct));
      saved.serviceItems = serviceItems.map((item) => ({ ...item, quoteId: saved.id } as QuoteServiceItem));
      return saved;
    });

    await this.transitionTicketItemStatus(owningTicketItemId, TicketItemStatus.QUOTED, [
      TicketItemStatus.DIAGNOSED,
      TicketItemStatus.ASSIGNED,
    ]);

    // For STANDARD_SERVICE, auto-approve quote by client (skip supervisor approval)
    if (ticketItem?.serviceType === 'STANDARD_SERVICE') {
      await this.transitionTicketItemStatus(owningTicketItemId, TicketItemStatus.CLIENT_APPROVED, [
        TicketItemStatus.QUOTED,
      ]);

      await this.transitionTicketItemStatus(owningTicketItemId, TicketItemStatus.READY_FOR_REPAIR, [
        TicketItemStatus.CLIENT_APPROVED,
      ]);

      // Mark quote as client approved
      await this.quoteRepository.update(quote.id, {
        clientApprovedAt: new Date(),
      });
    }

    return quote;
  }

  async update(id: number, dto: UpdateQuoteDto) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['productItems', 'serviceItems'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException('Cannot update a deleted quote');
    }

    quote.productItems = quote.productItems ?? [];
    quote.serviceItems = quote.serviceItems ?? [];

    let ticketItemChanged = false;
    let ticketItem = quote.ticketItemId
      ? await this.ticketItemRepository.findOne({ where: { id: quote.ticketItemId } })
      : null;
    if (dto.ticketItemId && dto.ticketItemId !== quote.ticketItemId) {
      ticketItem = await this.ensureTicketItem(dto.ticketItemId);
      quote.ticketItemId = ticketItem.id;
      ticketItemChanged = true;
    }

    if (dto.diagnosisId !== undefined) {
      if (dto.diagnosisId === null) {
        quote.diagnosisId = null;
      } else {
        const diagnosis = await this.ensureDiagnosis(dto.diagnosisId);
        if (quote.ticketItemId && diagnosis.ticketItemId !== quote.ticketItemId) {
          throw new BadRequestException(
            `Diagnosis ${diagnosis.id} does not belong to ticket item ${quote.ticketItemId}`,
          );
        }
        quote.diagnosisId = diagnosis.id;
      }
    }

    if (dto.totalAmount !== undefined) {
      quote.totalAmount = dto.totalAmount;
    }
    if (dto.currency !== undefined) {
      quote.currency = dto.currency;
    }
    if (dto.notes !== undefined) {
      quote.notes = dto.notes;
    }
    if (dto.sequenceNumber !== undefined) {
      quote.sequenceNumber = dto.sequenceNumber;
    }

    return this.quoteRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Quote);

      let shouldEnforceCurrent = false;
      if (dto.status === QuoteStatus.CURRENT) {
        quote.status = QuoteStatus.CURRENT;
        shouldEnforceCurrent = true;
      } else if (dto.status === QuoteStatus.ARCHIVED) {
        quote.status = QuoteStatus.ARCHIVED;
      }

      if (
        quote.ticketItemId &&
        (shouldEnforceCurrent || (ticketItemChanged && quote.status === QuoteStatus.CURRENT))
      ) {
        await repo
          .createQueryBuilder()
          .update()
          .set({ status: QuoteStatus.ARCHIVED })
          .where('ticket_item_id = :ticketItemId', { ticketItemId: quote.ticketItemId })
          .andWhere('id <> :id', { id: quote.id })
          .andWhere('status = :status', { status: QuoteStatus.CURRENT })
          .execute();
      }

      if (dto.products) {
        await manager.getRepository(QuoteProduct).delete({ quoteId: quote.id });
        const productItems = await this.buildProductItems(dto.products, manager);
        await this.persistProductItems(manager, quote.id, productItems);
        quote.productItems = productItems.map(
          (item) => ({ ...item, quoteId: quote.id } as QuoteProduct),
        );
      }

      if (dto.services) {
        await manager.getRepository(QuoteServiceItem).delete({ quoteId: quote.id });
        const servicePayload = ticketItem?.serviceType === ServiceType.DIAGNOSIS
          ? await this.ensureDiagnosticServiceItem(manager, dto.services)
          : dto.services;
        const serviceItems = await this.buildServiceItems(servicePayload, manager);
        await this.persistServiceItems(manager, quote.id, serviceItems);
        quote.serviceItems = serviceItems.map(
          (item) => ({ ...item, quoteId: quote.id } as QuoteServiceItem),
        );
      }

      quote.totalAmount = this.calculateTotalAmount(quote.productItems, quote.serviceItems);

      await repo.update(quote.id, {
        totalAmount: quote.totalAmount,
        currency: quote.currency,
        notes: quote.notes,
        sequenceNumber: quote.sequenceNumber,
        status: quote.status,
      });

      return quote;
    });
  }

  async softDelete(id: number) {
    await this.ensureQuote(id);
    await this.quoteRepository.softDelete(id);
    return { ok: true, message: `Quote ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.quoteRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} quotes deleted successfully` };
  }

  async restore(id: number) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
    }

    if (!quote.deletedAt) {
      return { ok: true, message: 'Quote already active' };
    }

    await this.quoteRepository.restore(id);
    return { ok: true, message: `Quote ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    const existing = await this.quoteRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
    });

    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) {
      throw new NotFoundException('No quotes found to restore');
    }

    await this.quoteRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} quotes restored successfully` };
  }

  private async ensureTicketItem(id: number) {
    const item = await this.ticketItemRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }
    return item;
  }

  private async ensureDiagnosis(id: number) {
    const diagnosis = await this.diagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) {
      throw new NotFoundException(`Diagnosis with id ${id} not found`);
    }
    return diagnosis;
  }

  private async ensureQuote(id: number) {
    const quote = await this.quoteRepository.findOne({ where: { id } });
    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
    }
  }

  private async resolveNextSequence(repo: Repository<Quote>, ticketItemId: number) {
    const raw = await repo
      .createQueryBuilder('quote')
      .select('MAX(quote.sequenceNumber)', 'max')
      .where('quote.ticketItemId = :ticketItemId', { ticketItemId })
      .withDeleted()
      .getRawOne<{ max: string | null } | undefined>();
    const maxValue = raw?.max ?? null;
    return (Number(maxValue) || 0) + 1;
  }

  private async buildProductItems(
    items: QuoteProductItemDto[] | undefined,
    manager: EntityManager,
  ): Promise<QuoteProduct[]> {
    if (!items?.length) {
      return [];
    }
    const repo = manager.getRepository(QuoteProduct);
    return items.map((item) => {
      const { productId, quantity, unitPrice, requiresPurchase, notes } = item;
      // Evitar que un id existente fuerce un UPDATE con quote_id nulo
      return repo.create({
        productId,
        quantity,
        unitPrice: unitPrice ?? 0,
        requiresPurchase: requiresPurchase ?? false,
        notes: notes ?? null,
      });
    });
  }

  private async buildServiceItems(
    items: QuoteServiceItemDto[] | undefined,
    manager: EntityManager,
  ): Promise<QuoteServiceItem[]> {
    if (!items?.length) {
      return [];
    }

    const repo = manager.getRepository(QuoteServiceItem);
    const serviceRepo = manager.getRepository(Service);
    const serviceIds = [...new Set(items.map((item) => item.serviceId))];
    const services = await serviceRepo.find({
      where: { id: In(serviceIds) },
    });
    const serviceMap = new Map(services.map((service) => [service.id, service]));

    return items.map((item) => {
      const service = serviceMap.get(item.serviceId);
      if (!service) {
        throw new NotFoundException(`Service with id ${item.serviceId} not found`);
      }
      const estimatedMinutes = service.estimatedDurationMinutes ?? 60;
      const estimatedHours = Number((estimatedMinutes / 60).toFixed(2));
      const unitPrice = Number(service.price ?? 0);
      return repo.create({
        serviceId: service.id,
        estimatedHours,
        unitPrice,
        notes: item.notes ?? null,
      });
    });
  }

  private async ensureDiagnosticServiceItem(
    manager: EntityManager,
    items: QuoteServiceItemDto[] | undefined,
  ): Promise<QuoteServiceItemDto[]> {
    const normalized = items ? [...items] : [];
    const serviceRepo = manager.getRepository(Service);
    const diagnostic = await serviceRepo.findOne({
      where: { code: QuotesService.DIAGNOSTIC_SERVICE_CODE },
    });

    if (!diagnostic) {
      throw new NotFoundException(
        `Service "${QuotesService.DIAGNOSTIC_SERVICE_CODE}" no encontrado. Ejecuta el seeder.`,
      );
    }

    const alreadyIncluded = normalized.some(
      (item) => Number(item.serviceId) === Number(diagnostic.id),
    );

    if (!alreadyIncluded) {
      normalized.push({ serviceId: diagnostic.id });
    }

    return normalized;
  }

  private async persistProductItems(
    manager: EntityManager,
    quoteId: number,
    items: QuoteProduct[],
  ) {
    if (!items.length) {
      return;
    }
    const values = items.map((item) => {
      const { id: _ignored, quoteId: _ignoredQuote, quote: _ignoredRel, ...rest } = item as any;
      return {
        ...rest,
        quoteId,
      };
    });

    await manager
      .createQueryBuilder()
      .insert()
      .into(QuoteProduct)
      .values(values)
      .execute();
  }

  private async persistServiceItems(
    manager: EntityManager,
    quoteId: number,
    items: QuoteServiceItem[],
  ) {
    if (!items.length) {
      return;
    }
    const values = items.map((item) => {
      const { id: _ignored, quoteId: _ignoredQuote, quote: _ignoredRel, ...rest } = item as any;
      return {
        ...rest,
        quoteId,
      };
    });

    await manager
      .createQueryBuilder()
      .insert()
      .into(QuoteServiceItem)
      .values(values)
      .execute();
  }

  private calculateTotalAmount(
    productItems: QuoteProduct[] | undefined,
    serviceItems: QuoteServiceItem[] | undefined,
  ): number {
    const productTotal =
      productItems?.reduce((acc, item) => acc + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0), 0) ?? 0;
    const serviceTotal =
      serviceItems?.reduce((acc, item) => acc + Number(item.unitPrice ?? 0), 0) ?? 0;
    return Number((productTotal + serviceTotal).toFixed(2));
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
    if (!value) {
      return undefined;
    }

    const values = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) as T[];

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

  async approveBySupervisor(quoteId: number, supervisorId: number, notes?: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId },
      relations: ['productItems', 'serviceItems'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${quoteId} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException(`Cannot approve a deleted quote`);
    }

    if (quote.status === QuoteStatus.SUPERVISOR_APPROVED) {
      throw new BadRequestException(`Quote ${quoteId} is already approved`);
    }

    if (quote.status === QuoteStatus.SUPERVISOR_REJECTED) {
      throw new BadRequestException(`Quote ${quoteId} has been rejected. Create a new version instead.`);
    }

    await this.ensureSupervisor(supervisorId);

    quote.approvedBySupervisorId = supervisorId;
    quote.approvedBySupervisorAt = new Date();
    quote.supervisorNotes = notes ?? null;
    quote.status = QuoteStatus.SUPERVISOR_APPROVED;

    // Clear rejection fields if previously rejected
    quote.rejectedBySupervisorId = null;
    quote.rejectedBySupervisorAt = null;

    await this.quoteRepository.save(quote);

    // Sync TicketItem status
    await this.transitionTicketItemStatus(
      quote.ticketItemId,
      TicketItemStatus.SUPERVISOR_APPROVED,
      [TicketItemStatus.QUOTED],
    );

    return quote;
  }

  async rejectBySupervisor(quoteId: number, supervisorId: number, notes: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId },
      relations: ['productItems', 'serviceItems'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${quoteId} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException(`Cannot reject a deleted quote`);
    }

    if (quote.status === QuoteStatus.SUPERVISOR_APPROVED) {
      throw new BadRequestException(`Quote ${quoteId} is already approved. Cannot reject.`);
    }

    if (quote.status === QuoteStatus.SUPERVISOR_REJECTED) {
      throw new BadRequestException(`Quote ${quoteId} is already rejected`);
    }

    await this.ensureSupervisor(supervisorId);

    quote.rejectedBySupervisorId = supervisorId;
    quote.rejectedBySupervisorAt = new Date();
    quote.supervisorNotes = notes;
    quote.status = QuoteStatus.SUPERVISOR_REJECTED;

    // Clear approval fields if previously approved
    quote.approvedBySupervisorId = null;
    quote.approvedBySupervisorAt = null;

    await this.quoteRepository.save(quote);

    // Sync TicketItem status
    await this.transitionTicketItemStatus(
      quote.ticketItemId,
      TicketItemStatus.SUPERVISOR_REJECTED,
      [TicketItemStatus.QUOTED],
    );

    return quote;
  }

  async resubmitQuote(id: number, dto: { products?: any[]; services?: any[]; notes?: string }): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['productItems', 'serviceItems', 'ticketItem'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException('Cannot resubmit a deleted quote');
    }

    // Only allow resubmitting rejected quotes
    if (quote.status !== QuoteStatus.SUPERVISOR_REJECTED) {
      throw new BadRequestException(
        `Quote ${id} can only be resubmitted if it has been rejected by supervisor`,
      );
    }

    return this.quoteRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Quote);

      // Update products if provided
      if (dto.products) {
        await manager.getRepository(QuoteProduct).delete({ quoteId: quote.id });
        const productItems = await this.buildProductItems(dto.products, manager);
        await this.persistProductItems(manager, quote.id, productItems);
        quote.productItems = productItems.map(
          (item) => ({ ...item, quoteId: quote.id } as QuoteProduct),
        );
      }

      // Update services if provided
      if (dto.services) {
        await manager.getRepository(QuoteServiceItem).delete({ quoteId: quote.id });
        const servicePayload = quote.ticketItem?.serviceType === ServiceType.DIAGNOSIS
          ? await this.ensureDiagnosticServiceItem(manager, dto.services)
          : dto.services;
        const serviceItems = await this.buildServiceItems(servicePayload, manager);
        await this.persistServiceItems(manager, quote.id, serviceItems);
        quote.serviceItems = serviceItems.map(
          (item) => ({ ...item, quoteId: quote.id } as QuoteServiceItem),
        );
      }

      // Recalculate total
      const totalAmount = this.calculateTotalAmount(quote.productItems, quote.serviceItems);

      // Update notes if provided
      if (dto.notes !== undefined) {
        quote.notes = dto.notes;
      }

      // Increment sequence number for this new version
      const nextSequence = (quote.sequenceNumber || 0) + 1;

      // Reset supervisor rejection fields and status
      const updateFields: Partial<Quote> = {
        totalAmount,
        notes: dto.notes !== undefined ? dto.notes : quote.notes,
        sequenceNumber: nextSequence,
        rejectedBySupervisorId: null,
        rejectedBySupervisorAt: null,
        supervisorNotes: null,
        status: QuoteStatus.PENDING_SUPERVISOR_APPROVAL,
      };

      // Save updated quote without cascading to product/service items
      await repo.update(quote.id, updateFields);

      // Sync TicketItem back to QUOTED
      await this.transitionTicketItemStatus(
        quote.ticketItemId,
        TicketItemStatus.QUOTED,
        [TicketItemStatus.SUPERVISOR_REJECTED],
      );

      // Return refreshed quote with items
      return repo.findOne({
        where: { id: quote.id },
        relations: ['productItems', 'serviceItems', 'ticketItem'],
      }) as Promise<Quote>;
    });
  }

  async sendToClient(quoteId: number, notes?: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId },
      relations: ['productItems', 'serviceItems'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${quoteId} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException(`Cannot send a deleted quote to client`);
    }

    if (quote.status !== QuoteStatus.SUPERVISOR_APPROVED) {
      throw new BadRequestException(
        `Quote ${quoteId} must be approved by supervisor before sending to client`,
      );
    }

    quote.sentToClientAt = new Date();
    if (notes) {
      quote.notes = notes;
    }
    quote.status = QuoteStatus.AWAITING_CLIENT_RESPONSE;

    await this.quoteRepository.save(quote);

    // Sync TicketItem status - First to SENT_TO_CLIENT
    await this.transitionTicketItemStatus(
      quote.ticketItemId,
      TicketItemStatus.SENT_TO_CLIENT,
      [TicketItemStatus.SUPERVISOR_APPROVED],
    );

    // Then immediately to AWAITING_CLIENT_RESPONSE
    await this.transitionTicketItemStatus(
      quote.ticketItemId,
      TicketItemStatus.AWAITING_CLIENT_RESPONSE,
      [TicketItemStatus.SENT_TO_CLIENT],
    );

    return quote;
  }

  async approveByClient(quoteId: number, notes?: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId },
      relations: ['productItems', 'serviceItems'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${quoteId} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException(`Cannot approve a deleted quote`);
    }

    if (!quote.sentToClientAt) {
      throw new BadRequestException(`Quote ${quoteId} has not been sent to client yet`);
    }

    if (quote.clientApprovedAt) {
      throw new BadRequestException(`Quote ${quoteId} is already approved by client`);
    }

    if (quote.clientRejectedAt) {
      throw new BadRequestException(`Quote ${quoteId} has been rejected by client`);
    }

    quote.clientApprovedAt = new Date();
    quote.clientNotes = notes ?? null;

    // Clear rejection fields if previously rejected
    quote.clientRejectedAt = null;
    quote.status = QuoteStatus.CLIENT_APPROVED;

    await this.quoteRepository.save(quote);

    // Sync TicketItem status
    await this.transitionTicketItemStatus(
      quote.ticketItemId,
      TicketItemStatus.CLIENT_APPROVED,
      [TicketItemStatus.SENT_TO_CLIENT, TicketItemStatus.AWAITING_CLIENT_RESPONSE],
    );

    return quote;
  }

  async rejectByClient(quoteId: number, notes?: string): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId },
      relations: ['productItems', 'serviceItems'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${quoteId} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException(`Cannot reject a deleted quote`);
    }

    if (!quote.sentToClientAt) {
      throw new BadRequestException(`Quote ${quoteId} has not been sent to client yet`);
    }

    if (quote.clientApprovedAt) {
      throw new BadRequestException(`Quote ${quoteId} is already approved by client. Cannot reject.`);
    }

    if (quote.clientRejectedAt) {
      throw new BadRequestException(`Quote ${quoteId} is already rejected by client`);
    }

    quote.clientRejectedAt = new Date();
    quote.clientNotes = notes ?? null;

    // Clear approval fields if previously approved
    quote.clientApprovedAt = null;
    quote.status = QuoteStatus.CLIENT_REJECTED;

    await this.quoteRepository.save(quote);

    // Sync TicketItem status
    await this.transitionTicketItemStatus(
      quote.ticketItemId,
      TicketItemStatus.CLIENT_REJECTED,
      [TicketItemStatus.SENT_TO_CLIENT, TicketItemStatus.AWAITING_CLIENT_RESPONSE],
    );

    return quote;
  }

  async resubmitAfterClientRejection(id: number, dto: { products?: any[]; services?: any[]; notes?: string }): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['productItems', 'serviceItems', 'ticketItem'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
    }

    if (quote.deletedAt) {
      throw new BadRequestException('Cannot resubmit a deleted quote');
    }

    // Only allow resubmitting rejected quotes
    if (!quote.clientRejectedAt) {
      throw new BadRequestException(
        `Quote ${id} can only be resubmitted if it has been rejected by client`,
      );
    }

    return this.quoteRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Quote);

      // Update products if provided
      if (dto.products) {
        await manager.getRepository(QuoteProduct).delete({ quoteId: quote.id });
        const productItems = await this.buildProductItems(dto.products, manager);
        await this.persistProductItems(manager, quote.id, productItems);
        quote.productItems = productItems.map(
          (item) => ({ ...item, quoteId: quote.id } as QuoteProduct),
        );
      }

      // Update services if provided
      if (dto.services) {
        await manager.getRepository(QuoteServiceItem).delete({ quoteId: quote.id });
        const servicePayload = quote.ticketItem?.serviceType === ServiceType.DIAGNOSIS
          ? await this.ensureDiagnosticServiceItem(manager, dto.services)
          : dto.services;
        const serviceItems = await this.buildServiceItems(servicePayload, manager);
        await this.persistServiceItems(manager, quote.id, serviceItems);
        quote.serviceItems = serviceItems.map(
          (item) => ({ ...item, quoteId: quote.id } as QuoteServiceItem),
        );
      }

      // Recalculate total
      const totalAmount = this.calculateTotalAmount(quote.productItems, quote.serviceItems);

      // Update notes if provided
      if (dto.notes !== undefined) {
        quote.notes = dto.notes;
      }

      // Increment sequence number for this new version
      const nextSequence = (quote.sequenceNumber || 0) + 1;

      // Reset client rejection fields and status
      const needsSupervisorApproval = quote.ticketItem?.serviceType === 'DIAGNOSIS';
      const updateFields: Partial<Quote> = {
        totalAmount,
        notes: dto.notes !== undefined ? dto.notes : quote.notes,
        sequenceNumber: nextSequence,
        clientRejectedAt: null,
        clientNotes: null,
        sentToClientAt: null,
        approvedBySupervisorId: null,
        approvedBySupervisorAt: null,
        rejectedBySupervisorId: null,
        rejectedBySupervisorAt: null,
        supervisorNotes: null,
        updatedAt: new Date(),
        status: needsSupervisorApproval ? QuoteStatus.PENDING_SUPERVISOR_APPROVAL : QuoteStatus.CURRENT,
      };

      // Save updated quote without cascading to items
      await repo.update(quote.id, updateFields);

      // Sync TicketItem back to QUOTED
      await this.transitionTicketItemStatus(
        quote.ticketItemId,
        TicketItemStatus.QUOTED,
        [TicketItemStatus.CLIENT_REJECTED],
      );

      // Return refreshed quote with items
      return repo.findOne({
        where: { id: quote.id },
        relations: ['productItems', 'serviceItems', 'ticketItem'],
      }) as Promise<Quote>;
    });
  }

  private async ensureSupervisor(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    if (!user.isActive) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }
    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    const isSupervisor = hasRoleName(user.roles, SUPERVISOR_ROLE_NAMES);
    if (!isSupervisor) {
      throw new BadRequestException(`User with id ${id} is not a supervisor`);
    }

    return user;
  }

  private async transitionTicketItemStatus(
    ticketItemId: number | null,
    targetStatus: TicketItemStatus,
    allowedStatuses: TicketItemStatus[],
  ) {
    if (!ticketItemId) {
      return;
    }

    const item = await this.ticketItemRepository.findOne({ where: { id: ticketItemId } });
    if (!item) {
      return;
    }

    if (!allowedStatuses.includes(item.status) || item.status === targetStatus) {
      return;
    }

    await this.ticketItemService.changeStatus(ticketItemId, targetStatus);
  }
}
