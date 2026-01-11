import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, In } from 'typeorm';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { Ticket } from '../entities/ticket.entity';
import { TicketItem } from '../entities/ticket-item.entity';
import { BusinessPartner } from '../../business-partner/entities/business-partner.entity';
import { TicketItemStatus, TicketPriority, TicketStatus } from '../enums';
import { TicketItemService } from './ticket-item.service';
import { User } from '../../users/entities/user.entity';

type FindAllTicketsQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: string;
  priority?: string;
  businessPartnerId?: number | string;
  itemStatus?: string;
  withDeleted?: string;
  includeItems?: string | boolean;
  from?: string;
  to?: string;
};

@Injectable()
export class TicketService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    @InjectRepository(BusinessPartner)
    private readonly businessPartnerRepository: Repository<BusinessPartner>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ticketItemService: TicketItemService,
  ) {}

  async create(dto: CreateTicketDto, creatorId: number): Promise<Ticket> {
    const partner = await this.ensureBusinessPartner(dto.businessPartnerId);
    await this.ensureUser(creatorId);

    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const code = await this.generateNextTicketCode();
        const now = new Date();
        const items = await this.ticketItemService.createItemsWithAutoAssignment(
          dto.items,
          0,
          now,
        );

        const ticketPartial: Partial<Ticket> = {
          code,
          businessPartnerId: partner.id,
          createdBy: creatorId,
          priority: dto.priority ?? TicketPriority.MEDIUM,
          contactName: dto.contactName ?? partner.name,
          contactPhone: dto.contactPhone ?? partner.phone ?? null,
          contactEmail: dto.contactEmail ?? partner.email ?? null,
          estimatedDeliveryDate: dto.estimatedDeliveryDate ? new Date(dto.estimatedDeliveryDate) : null,
          paymentStatus: dto.paymentStatus ?? undefined,
          currency: dto.currency ?? undefined,
          notes: dto.notes ?? null,
          itemsCount: items.length,
          completedItemsCount: 0,
          items,
        };

        const ticket = this.ticketRepository.create(ticketPartial);

        this.ticketItemService.applyAggregates(ticket);

        const savedTicket = await this.ticketRepository.save(ticket);

        await this.ticketItemService.notifyTechnicianAssignmentsForTicket(
          savedTicket.code,
          items,
          savedTicket.contactPhone ?? partner.phone ?? null,
        );

        return savedTicket;
      } catch (error) {
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          throw error;
        }

        lastError = error;
        const isDuplicate =
          error?.code === 'ER_DUP_ENTRY' ||
          error?.code === '23505' ||
          error?.message?.includes('duplicate') ||
          error?.message?.includes('unique');

        if (isDuplicate && attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
          continue;
        }
      }
    }

    throw new ConflictException('Could not generate a unique ticket code');
  }

  async findAll(query: FindAllTicketsQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';
    const includeItems = query.includeItems === true || query.includeItems === 'true';

    const statuses = this.parseEnumList<TicketStatus>(query.status, TicketStatus, 'status');
    const priorities = this.parseEnumList<TicketPriority>(query.priority, TicketPriority, 'priority');
    const itemStatuses = this.parseEnumList<TicketItemStatus>(
      query.itemStatus,
      TicketItemStatus,
      'itemStatus',
    );

    const qb = this.ticketRepository.createQueryBuilder('ticket');

    const searchTerm = query.search?.trim();
    const shouldJoinItems = includeItems || itemStatuses?.length || !!searchTerm;
    const itemJoinCondition = includeDeleted ? undefined : 'item.deletedAt IS NULL';

    if (shouldJoinItems) {
      if (includeItems) {
        qb.leftJoinAndSelect('ticket.items', 'item', itemJoinCondition)
          .leftJoinAndSelect('item.assignedTechnician', 'assignedTechnician')
          .leftJoinAndSelect('item.assignedSupervisor', 'assignedSupervisor');
      } else {
        qb.leftJoin('ticket.items', 'item', itemJoinCondition);
      }
    }

    if (includeDeleted) {
      qb.withDeleted();
    }

    if (statuses?.length) {
      qb.andWhere('ticket.status IN (:...statuses)', { statuses });
    }

    if (priorities?.length) {
      qb.andWhere('ticket.priority IN (:...priorities)', { priorities });
    }

    if (query.businessPartnerId !== undefined) {
      const businessPartnerId = this.parsePositiveNumber(
        query.businessPartnerId,
        undefined,
        'businessPartnerId',
      );
      qb.andWhere('ticket.businessPartnerId = :businessPartnerId', { businessPartnerId });
    }

    if (itemStatuses?.length) {
      qb.andWhere('item.status IN (:...itemStatuses)', { itemStatuses });
    }

    if (searchTerm) {
      const normalizedSearch = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(ticket.code) LIKE :search')
            .orWhere('LOWER(ticket.contactName) LIKE :search')
            .orWhere('LOWER(ticket.contactPhone) LIKE :search')
            .orWhere('LOWER(ticket.contactEmail) LIKE :search')
            .orWhere('LOWER(item.serialNumber) LIKE :search')
            .orWhere('LOWER(item.initialIssue) LIKE :search');
        }),
      ).setParameter('search', normalizedSearch);
    }

    qb.loadRelationCountAndMap(
      'ticket.pendingQuoteItemsCount',
      'ticket.items',
      'pendingItems',
      (countQb) => {
        if (!includeDeleted) {
          countQb.andWhere('pendingItems.deletedAt IS NULL');
        }
        return countQb.andWhere('pendingItems.status = :pendingStatus', {
          pendingStatus: TicketItemStatus.DIAGNOSED,
        });
      },
    );

    qb.loadRelationCountAndMap(
      'ticket.rejectedQuoteItemsCount',
      'ticket.items',
      'rejectedItems',
      (countQb) => {
        if (!includeDeleted) {
          countQb.andWhere('rejectedItems.deletedAt IS NULL');
        }
        return countQb.andWhere('rejectedItems.status IN (:...rejectedStatuses)', {
          rejectedStatuses: [TicketItemStatus.SUPERVISOR_REJECTED, TicketItemStatus.CLIENT_REJECTED],
        });
      },
    );

    qb.loadRelationCountAndMap(
      'ticket.pendingDeliveryItemsCount',
      'ticket.items',
      'deliveryItems',
      (countQb) => {
        if (!includeDeleted) {
          countQb.andWhere('deliveryItems.deletedAt IS NULL');
        }
        return countQb.andWhere('deliveryItems.status = :deliveryStatus', {
          deliveryStatus: TicketItemStatus.REPAIRED,
        });
      },
    );

    const fromDate = this.parseDate(query.from, 'from');
    if (fromDate) {
      qb.andWhere('ticket.createdAt >= :from', { from: fromDate });
    }

    const toDate = this.parseDate(query.to, 'to');
    if (toDate) {
      qb.andWhere('ticket.createdAt <= :to', { to: toDate });
    }

    qb.orderBy('ticket.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number, withDeleted = false): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id },
      relations: ['items', 'items.assignedTechnician', 'items.assignedSupervisor'],
      withDeleted,
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id ${id} not found`);
    }

    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id ${id} not found`);
    }

    if (dto.businessPartnerId && dto.businessPartnerId !== ticket.businessPartnerId) {
      await this.ensureBusinessPartner(dto.businessPartnerId);
      ticket.businessPartnerId = dto.businessPartnerId;
    }

    if (dto.priority) {
      ticket.priority = dto.priority;
    }

    if (dto.contactName !== undefined) {
      ticket.contactName = dto.contactName;
    }
    if (dto.contactPhone !== undefined) {
      ticket.contactPhone = dto.contactPhone;
    }
    if (dto.contactEmail !== undefined) {
      ticket.contactEmail = dto.contactEmail;
    }
    if (dto.estimatedDeliveryDate !== undefined) {
      ticket.estimatedDeliveryDate = dto.estimatedDeliveryDate
        ? new Date(dto.estimatedDeliveryDate)
        : null;
    }
    if (dto.paymentStatus) {
      ticket.paymentStatus = dto.paymentStatus;
    }
    if (dto.currency) {
      ticket.currency = dto.currency;
    }
    if (dto.notes !== undefined) {
      ticket.notes = dto.notes;
    }

    if (dto.items?.length) {
      const startingNumber = ticket.items?.length
        ? Math.max(...ticket.items.map((item) => item.itemNumber))
        : 0;
      const now = new Date();
      const newItems = await this.ticketItemService.createItemsWithAutoAssignment(
        dto.items,
        startingNumber,
        now,
      );
      ticket.items = [...(ticket.items ?? []), ...newItems];
    }

    this.ticketItemService.applyAggregates(ticket);

    const savedTicket = await this.ticketRepository.save(ticket);

    return savedTicket;
  }

  async softDelete(id: number) {
    await this.ensureTicketExists(id);
    await this.ticketRepository.softDelete(id);
    await this.ticketItemRepository
      .createQueryBuilder()
      .softDelete()
      .where('ticket_id = :id', { id })
      .execute();

    return { ok: true, message: `Ticket with id ${id} deleted successfully` };
  }

  async restore(id: number) {
    const ticket = await this.ticketRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id ${id} not found`);
    }

    if (!ticket.deletedAt) {
      return { ok: true, message: 'Ticket already active' };
    }

    await this.ticketRepository.restore(id);
    await this.ticketItemRepository
      .createQueryBuilder()
      .restore()
      .where('ticket_id = :id', { id })
      .execute();

    return { ok: true, message: `Ticket with id ${id} restored successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.ticketRepository.find({
      where: { id: In(ids) },
      select: ['id'],
    });

    if (!existing.length) {
      throw new NotFoundException('No tickets found for provided ids');
    }

    const existingIds = existing.map((ticket) => ticket.id);
    await this.ticketRepository.softDelete(existingIds);
    await this.ticketItemRepository
      .createQueryBuilder()
      .softDelete()
      .where('ticket_id IN (:...ids)', { ids: existingIds })
      .execute();

    return { ok: true, message: `${existingIds.length} tickets deleted successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.ticketRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
      select: ['id', 'deletedAt'],
    });

    if (!existing.length) {
      throw new NotFoundException('No tickets found for provided ids');
    }

    const toRestore = existing.filter((ticket) => ticket.deletedAt);
    if (!toRestore.length) {
      return { ok: true, message: 'Tickets already active' };
    }

    const idsToRestore = toRestore.map((ticket) => ticket.id);

    await this.ticketRepository.restore(idsToRestore);
    await this.ticketItemRepository
      .createQueryBuilder()
      .restore()
      .where('ticket_id IN (:...ids)', { ids: idsToRestore })
      .execute();

    return { ok: true, message: `${idsToRestore.length} tickets restored successfully` };
  }

  private async ensureTicketExists(id: number) {
    const exists = await this.ticketRepository.findOne({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`Ticket with id ${id} not found`);
    }
  }

  private async ensureBusinessPartner(id: number): Promise<BusinessPartner> {
    const partner = await this.businessPartnerRepository.findOne({
      where: { id },
    });

    if (!partner) {
      throw new NotFoundException(`Business partner with id ${id} not found`);
    }

    return partner;
  }

  private async ensureUser(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    return user;
  }

  private ensureIds(ids: number[]) {
    if (!ids?.length) {
      throw new BadRequestException('No ids provided');
    }
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
      throw new BadRequestException(
        `${field} contains invalid values: ${invalid.join(', ')}`,
      );
    }

    return values;
  }

  private parseDate(value: string | undefined, field: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }

    return date;
  }

  private async generateNextTicketCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const prefix = `ST${year}${month}${day}${hours}${minutes}`;

    const lastTicket = await this.ticketRepository
      .createQueryBuilder('ticket')
      .withDeleted()
      .where('ticket.code LIKE :pattern', { pattern: `${prefix}%` })
      .orderBy('ticket.code', 'DESC')
      .limit(1)
      .getOne();

    if (!lastTicket) {
      return `${prefix}0001`;
    }

    const numberPart = lastTicket.code.slice(prefix.length);

    const current = Number(numberPart);
    if (!Number.isFinite(current)) {
      return `${prefix}0001`;
    }

    const next = (current + 1).toString().padStart(4, '0');
    return `${prefix}${next}`;
  }

}
