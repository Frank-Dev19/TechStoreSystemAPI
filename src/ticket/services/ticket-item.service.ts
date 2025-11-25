import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, Brackets, In, Not, IsNull } from 'typeorm';
import { TicketItem } from '../entities/ticket-item.entity';
import { Ticket } from '../entities/ticket.entity';
import { CreateTicketItemDto } from '../dto/create-ticket-item.dto';
import { ServiceLocation, TicketItemStatus, TicketStatus } from '../enums';
import { canTransitionTicketItem } from '../state-machines/ticket-item.state-machine';
import { User } from '../../users/entities/user.entity';

type FindTicketItemsQuery = {
  page?: number | string;
  limit?: number | string;
  status?: string;
  ticketId?: number | string;
  technicianId?: number | string;
  assignedToMe?: string;
  withDeleted?: string;
  search?: string;
};

@Injectable()
export class TicketItemService {
  constructor(
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private readonly terminalItemStatuses = [
    TicketItemStatus.DELIVERED,
    TicketItemStatus.QUOTE_REJECTED,
    TicketItemStatus.CANCELLED,
  ];

  async createItemsWithAutoAssignment(
    dtos: CreateTicketItemDto[],
    startingNumber: number,
    now: Date,
  ): Promise<TicketItem[]> {
    if (!dtos?.length) {
      return [];
    }

    const technicianLoads = await this.prepareTechnicianLoadMap();

    return dtos.map((dto, index) => {
      const technicianId = this.pickTechnicianId(technicianLoads);
      return this.buildTicketItem(dto, startingNumber + index + 1, now, technicianId);
    });
  }

  private buildTicketItem(
    dto: CreateTicketItemDto,
    itemNumber: number,
    now: Date,
    technicianId?: number,
  ): TicketItem {
    const slaTargetDays = dto.slaTargetDays ?? 5;
    const slaStartDate = now;
    const slaDeadline = slaTargetDays
      ? new Date(slaStartDate.getTime() + slaTargetDays * 24 * 60 * 60 * 1000)
      : null;

    const partial: DeepPartial<TicketItem> = {
      itemNumber,
      equipmentType: dto.equipmentType,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      serialNumber: dto.serialNumber ?? null,
      initialIssue: dto.initialIssue,
      accessories: dto.accessories ?? null,
      requiresDiagnosis: dto.requiresDiagnosis ?? true,
      serviceLocation: dto.serviceLocation ?? ServiceLocation.ON_SITE,
      serviceAddress: dto.serviceAddress ?? null,
      serviceAddressReference: dto.serviceAddressReference ?? null,
      scheduledServiceDate: dto.scheduledServiceDate ? new Date(dto.scheduledServiceDate) : null,
      slaTargetDays,
      slaStartDate,
      slaDeadline,
      requiresParts: dto.requiresParts ?? false,
      estimatedRepairHours: dto.estimatedRepairHours ?? null,
      receivedAt: now,
      assignedToTechnicianId: technicianId ?? null,
      assignedAt: technicianId ? now : null,
      status: technicianId ? TicketItemStatus.ASSIGNED : TicketItemStatus.RECEIVED,
    };

    return this.ticketItemRepository.create(partial);
  }

  applyAggregates(ticket: Ticket): void {
    const items = ticket.items ?? [];
    const activeItems = items.filter((item) => !item.deletedAt);

    ticket.itemsCount = activeItems.length;

    const terminalStatuses = this.terminalItemStatuses;

    ticket.completedItemsCount = activeItems.filter((item) =>
      terminalStatuses.includes(item.status),
    ).length;

    if (!activeItems.length) {
      ticket.status = TicketStatus.CANCELLED;
      return;
    }

    const allCancelled = activeItems.every((item) => item.status === TicketItemStatus.CANCELLED);
    if (allCancelled) {
      ticket.status = TicketStatus.CANCELLED;
      return;
    }

    const allTerminal = activeItems.every((item) => terminalStatuses.includes(item.status));
    if (allTerminal) {
      ticket.status = TicketStatus.COMPLETED;
      return;
    }

    const hasTerminal = activeItems.some((item) => terminalStatuses.includes(item.status));
    if (hasTerminal) {
      ticket.status = TicketStatus.PARTIALLY_COMPLETED;
      return;
    }

    const hasProgress = activeItems.some((item) => item.status !== TicketItemStatus.RECEIVED);
    if (hasProgress) {
      ticket.status = TicketStatus.IN_PROGRESS;
      return;
    }

    ticket.status = TicketStatus.OPEN;
  }

  async findAll(query: FindTicketItemsQuery, currentUserId?: number) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';
    const statuses = this.parseEnumList<TicketItemStatus>(query.status, TicketItemStatus, 'status');

    const qb = this.ticketItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.ticket', 'ticket');

    if (includeDeleted) {
      qb.withDeleted();
    }

    if (statuses?.length) {
      qb.andWhere('item.status IN (:...statuses)', { statuses });
    }

    if (query.ticketId !== undefined) {
      const ticketId = this.parsePositiveNumber(query.ticketId, undefined, 'ticketId');
      qb.andWhere('item.ticketId = :ticketId', { ticketId });
    }

    let technicianId: number | undefined;
    if (query.assignedToMe === 'true') {
      if (!currentUserId) {
        throw new BadRequestException('No se puede filtrar por assignedToMe sin usuario autenticado');
      }
      technicianId = currentUserId;
    } else if (query.technicianId !== undefined) {
      technicianId = this.parsePositiveNumber(query.technicianId, undefined, 'technicianId');
    }

    if (technicianId !== undefined) {
      qb.andWhere('item.assignedToTechnicianId = :technicianId', { technicianId });
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const normalized = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(item.serialNumber) LIKE :search')
            .orWhere('LOWER(item.model) LIKE :search')
            .orWhere('LOWER(item.brand) LIKE :search')
            .orWhere('LOWER(item.initialIssue) LIKE :search')
            .orWhere('LOWER(ticket.code) LIKE :search');
        }),
      ).setParameter('search', normalized);
    }

    qb
      .orderBy('item.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number, withDeleted = false): Promise<TicketItem> {
    const item = await this.ticketItemRepository.findOne({
      where: { id },
      withDeleted,
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }

    return item;
  }

  private async prepareTechnicianLoadMap(): Promise<Map<number, number>> {
    const technicians = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .distinct(true)
      .where('LOWER(role.name) = :role', { role: 'technician' })
      .andWhere('user.isActive = true')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    if (!technicians.length) {
      throw new BadRequestException('No hay técnicos disponibles para asignar ticket items');
    }

    const loadMap = new Map<number, number>();
    technicians.forEach((tech) => loadMap.set(tech.id, 0));

    const loadRows = await this.ticketItemRepository
      .createQueryBuilder('item')
      .select('item.assignedToTechnicianId', 'technicianId')
      .addSelect('COUNT(*)', 'count')
      .where('item.assignedToTechnicianId IS NOT NULL')
      .andWhere('item.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: this.terminalItemStatuses,
      })
      .andWhere('item.deletedAt IS NULL')
      .groupBy('item.assignedToTechnicianId')
      .getRawMany<{ technicianId: string; count: string }>();

    for (const row of loadRows) {
      const technicianId = Number(row.technicianId);
      if (loadMap.has(technicianId)) {
        loadMap.set(technicianId, Number(row.count));
      }
    }

    return loadMap;
  }

  private pickTechnicianId(loadMap: Map<number, number>): number {
    const candidates = [...loadMap.entries()];
    if (!candidates.length) {
      throw new BadRequestException('No hay técnicos disponibles para asignar ticket items');
    }

    candidates.sort((a, b) => {
      if (a[1] === b[1]) {
        return a[0] - b[0];
      }
      return a[1] - b[1];
    });

    const [technicianId, load] = candidates[0];
    loadMap.set(technicianId, load + 1);
    return technicianId;
  }

  async assignTechnician(itemId: number, technicianId: number): Promise<TicketItem> {
    const item = await this.ticketItemRepository.findOne({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`Ticket item with id ${itemId} is deleted`);
    }

    await this.ensureTechnician(technicianId);

    item.assignedToTechnicianId = technicianId;
    item.assignedAt = new Date();

    if (item.status === TicketItemStatus.RECEIVED) {
      item.status = TicketItemStatus.ASSIGNED;
    }

    await this.ticketItemRepository.save(item);
    await this.refreshAggregatesForTicket(item.ticketId);

    return item;
  }

  async softDelete(id: number) {
    const item = await this.ticketItemRepository.findOne({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }

    await this.ticketItemRepository.softDelete(id);
    await this.refreshAggregatesForTicket(item.ticketId);

    return { ok: true, message: `Ticket item with id ${id} deleted successfully` };
  }

  async restore(id: number) {
    const item = await this.ticketItemRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${id} not found`);
    }

    if (!item.deletedAt) {
      return { ok: true, message: 'Ticket item already active' };
    }

    await this.ticketItemRepository.restore(id);
    await this.refreshAggregatesForTicket(item.ticketId);

    return { ok: true, message: `Ticket item with id ${id} restored successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.ticketItemRepository.find({
      where: { id: In(ids) },
      select: ['id', 'ticketId'],
    });

    if (!existing.length) {
      throw new NotFoundException('No ticket items found for provided ids');
    }

    const existingIds = existing.map((item) => item.id);
    await this.ticketItemRepository.softDelete(existingIds);

    const ticketIds = [...new Set(existing.map((item) => item.ticketId))];
    await Promise.all(ticketIds.map((ticketId) => this.refreshAggregatesForTicket(ticketId)));

    return { ok: true, message: `${existingIds.length} ticket items deleted successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.ticketItemRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
      select: ['id', 'ticketId', 'deletedAt'],
    });

    const deletedItems = existing.filter((item) => item.deletedAt);
    if (!deletedItems.length) {
      throw new NotFoundException('No deleted ticket items found for provided ids');
    }

    const idsToRestore = deletedItems.map((item) => item.id);
    await this.ticketItemRepository.restore(idsToRestore);

    const ticketIds = [...new Set(deletedItems.map((item) => item.ticketId))];
    await Promise.all(ticketIds.map((ticketId) => this.refreshAggregatesForTicket(ticketId)));

    return { ok: true, message: `${idsToRestore.length} ticket items restored successfully` };
  }

  async changeStatus(itemId: number, newStatus: TicketItemStatus) {
    const item = await this.ticketItemRepository.findOne({
      where: { id: itemId },
      withDeleted: true,
    });

    if (!item) {
      throw new NotFoundException(`Ticket item with id ${itemId} not found`);
    }

    if (item.deletedAt) {
      throw new BadRequestException(`Ticket item with id ${itemId} is deleted`);
    }

    if (!canTransitionTicketItem(item.status, newStatus)) {
      throw new BadRequestException(
        `Cannot transition ticket item ${itemId} from ${item.status} to ${newStatus}`,
      );
    }

    if (newStatus === TicketItemStatus.IN_DIAGNOSIS) {
      const technicianId = item.assignedToTechnicianId;
      if (!technicianId) {
        throw new BadRequestException(
          `Ticket item ${itemId} cannot enter diagnosis without assigned technician`,
        );
      }

      const existingDiagnosis = await this.ticketItemRepository.findOne({
        where: {
          assignedToTechnicianId: technicianId,
          status: TicketItemStatus.IN_DIAGNOSIS,
          id: Not(itemId),
          deletedAt: IsNull(),
        },
      });

      if (existingDiagnosis) {
        throw new BadRequestException(
          `Technician ${technicianId} already has item ${existingDiagnosis.id} in IN_DIAGNOSIS`,
        );
      }
    }

    item.status = newStatus;
    const now = new Date();

    switch (newStatus) {
      case TicketItemStatus.ASSIGNED:
        item.assignedAt = now;
        break;
      case TicketItemStatus.IN_DIAGNOSIS:
        item.diagnosisStartedAt = item.diagnosisStartedAt ?? now;
        break;
      case TicketItemStatus.DIAGNOSED:
        item.diagnosisCompletedAt = now;
        item.actualDiagnosisHours = this.calculateDurationHours(
          item.diagnosisStartedAt,
          item.diagnosisCompletedAt,
        );
        break;
      case TicketItemStatus.QUOTED:
        item.quotedAt = now;
        break;
      case TicketItemStatus.QUOTE_SENT:
        item.quoteSentAt = now;
        break;
      case TicketItemStatus.QUOTE_APPROVED:
        item.quoteApprovedAt = now;
        item.lastCustomerResponseAt = now;
        break;
      case TicketItemStatus.QUOTE_REJECTED:
        item.quoteRejectedAt = now;
        item.lastCustomerResponseAt = now;
        break;
      case TicketItemStatus.AWAITING_PARTS:
        item.partsRequestedAt = item.partsRequestedAt ?? now;
        break;
      case TicketItemStatus.IN_REPAIR:
        item.repairStartedAt = item.repairStartedAt ?? now;
        break;
      case TicketItemStatus.REPAIRED:
        item.repairCompletedAt = now;
        item.actualRepairHours = this.calculateDurationHours(
          item.repairStartedAt,
          item.repairCompletedAt,
        );
        break;
      case TicketItemStatus.READY_FOR_DELIVERY:
        item.readyForDeliveryAt = now;
        break;
      case TicketItemStatus.DELIVERED:
        item.deliveredAt = now;
        break;
      case TicketItemStatus.CANCELLED:
        item.cancelledAt = now;
        break;
      default:
        break;
    }

    await this.ticketItemRepository.save(item);
    await this.refreshAggregatesForTicket(item.ticketId);

    return item;
  }

  private async refreshAggregatesForTicket(ticketId?: number) {
    if (!ticketId) {
      return;
    }

    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['items'],
      withDeleted: true,
    });

    if (!ticket) {
      return;
    }

    this.applyAggregates(ticket);
    await this.ticketRepository.save(ticket);
  }

  private hasItemWithStatus(items: TicketItem[], statuses: TicketItemStatus[]): boolean {
    return items.some((item) => statuses.includes(item.status));
  }

  private async ensureTechnician(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (!user.isActive) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    if (user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }

    const isTechnician = user.roles?.some((role) => role.name?.toLowerCase() === 'technician');
    if (!isTechnician) {
      throw new BadRequestException(`User with id ${id} is not a technician`);
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

  private calculateDurationHours(start?: Date | null, end?: Date | null): number | null {
    if (!start || !end) {
      return null;
    }
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Number(diff.toFixed(2));
  }
}
