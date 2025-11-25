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
import { TicketItemStatus } from '../enums';
import { TicketItemService } from '../services/ticket-item.service';

type FindQuotesQuery = {
  page?: number | string;
  limit?: number | string;
  ticketItemId?: number | string;
  status?: string;
  withDeleted?: string;
};

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    @InjectRepository(TicketItemDiagnosis)
    private readonly diagnosisRepository: Repository<TicketItemDiagnosis>,
    private readonly ticketItemService: TicketItemService,
  ) {}

  async findAll(query: FindQuotesQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<QuoteStatus>(query.status, QuoteStatus, 'status');

    const qb = this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.productItems', 'productItems')
      .leftJoinAndSelect('quote.serviceItems', 'serviceItems')
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

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['productItems', 'serviceItems'],
      withDeleted,
    });

    if (!quote) {
      throw new NotFoundException(`Quote with id ${id} not found`);
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
      const serviceItems = await this.buildServiceItems(dto.services, manager);
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

      const entity = repo.create({
        ticketItemId: owningTicketItemId,
        diagnosisId: diagnosis?.id ?? null,
        sequenceNumber: sequenceNumber ?? 1,
        status: QuoteStatus.CURRENT,
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
    ]);

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
    if (dto.ticketItemId && dto.ticketItemId !== quote.ticketItemId) {
      const ticketItem = await this.ensureTicketItem(dto.ticketItemId);
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
        const serviceItems = await this.buildServiceItems(dto.services, manager);
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
    return items.map((item) =>
      repo.create({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? 0,
        requiresPurchase: item.requiresPurchase ?? false,
        notes: item.notes ?? null,
      }),
    );
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

  private async persistProductItems(
    manager: EntityManager,
    quoteId: number,
    items: QuoteProduct[],
  ) {
    if (!items.length) {
      return;
    }
    const repo = manager.getRepository(QuoteProduct);
    await repo.save(
      items.map((item) =>
        repo.create({
          ...item,
          quoteId,
        }),
      ),
    );
  }

  private async persistServiceItems(
    manager: EntityManager,
    quoteId: number,
    items: QuoteServiceItem[],
  ) {
    if (!items.length) {
      return;
    }
    const repo = manager.getRepository(QuoteServiceItem);
    await repo.save(
      items.map((item) =>
        repo.create({
          ...item,
          quoteId,
        }),
      ),
    );
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
