import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { CreateServiceOrderDto } from '../dto/create-service-order.dto';
import { UpdateServiceOrderDto } from '../dto/update-service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { Client } from '../../clients/entities/client.entity';
import { RequestOrigin, ServiceOrderItemStatus, ServiceOrderPriority, ServiceOrderStatus } from '../enums';
import { ServiceOrderItemService } from './service-order-item.service';
import { User } from '../../users/entities/user.entity';

type FindAllServiceOrdersQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: string;
  priority?: string;
  clientId?: number | string;
  itemStatus?: string;
  withDeleted?: string;
  includeItems?: string | boolean;
  from?: string;
  to?: string;
};

@Injectable()
export class ServiceOrderService {
  constructor(
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderItem)
    private readonly serviceOrderItemRepository: Repository<ServiceOrderItem>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly serviceOrderItemService: ServiceOrderItemService,
  ) {}

  async create(dto: CreateServiceOrderDto, creatorId: number): Promise<ServiceOrder> {
    await this.ensureUser(creatorId);
    const requestOrigin = dto.requestOrigin ?? RequestOrigin.CLIENT;
    const client = await this.resolveClientForRequest(dto.clientId, requestOrigin);

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const code = await this.generateNextServiceOrderCode();
        const now = new Date();
        const items = await this.serviceOrderItemService.createItemsWithAutoAssignment(
          dto.items,
          0,
          now,
        );

        const serviceOrder = this.serviceOrderRepository.create({
          code,
          clientId: client?.id ?? null,
          createdBy: creatorId,
          priority: dto.priority ?? ServiceOrderPriority.MEDIUM,
          requestOrigin,
          estimatedDeliveryDate: dto.estimatedDeliveryDate ? new Date(dto.estimatedDeliveryDate) : null,
          notes: dto.notes ?? null,
          items,
        });
        this.applyClientSnapshot(serviceOrder, client);

        this.serviceOrderItemService.applyAggregates(serviceOrder);

        const savedServiceOrder = await this.serviceOrderRepository.save(serviceOrder);
        await this.serviceOrderItemService.registerAutoAssignments(items);

        await this.serviceOrderItemService.notifyTechnicianAssignmentsForServiceOrder(
          savedServiceOrder.code,
          items,
          client?.phone ?? null,
        );

        return savedServiceOrder;
      } catch (error: any) {
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          throw error;
        }

        const isDuplicate =
          error?.code === 'ER_DUP_ENTRY' ||
          error?.code === '23505' ||
          error?.message?.includes('duplicate') ||
          error?.message?.includes('unique');

        if (!isDuplicate || attempt === maxRetries - 1) {
          throw error;
        }
      }
    }

    throw new ConflictException('Could not generate a unique service order code');
  }

  async findAll(query: FindAllServiceOrdersQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const includeDeleted = query.withDeleted === 'true';
    const includeItems = query.includeItems === true || query.includeItems === 'true';

    const statuses = this.parseEnumList<ServiceOrderStatus>(query.status, ServiceOrderStatus, 'status');
    const priorities = this.parseEnumList<ServiceOrderPriority>(query.priority, ServiceOrderPriority, 'priority');
    const itemStatuses = this.parseEnumList<ServiceOrderItemStatus>(
      query.itemStatus,
      ServiceOrderItemStatus,
      'itemStatus',
    );

    const qb = this.serviceOrderRepository.createQueryBuilder('serviceOrder');
    const searchTerm = query.search?.trim();
    const shouldJoinItems = includeItems || Boolean(itemStatuses?.length) || Boolean(searchTerm);
    const itemJoinCondition = includeDeleted ? undefined : 'serviceOrderItem.deletedAt IS NULL';

    if (shouldJoinItems) {
      if (includeItems) {
        qb.leftJoinAndSelect('serviceOrder.items', 'serviceOrderItem', itemJoinCondition)
          .leftJoinAndSelect('serviceOrderItem.assignedTechnician', 'assignedTechnician');
      } else {
        qb.leftJoin('serviceOrder.items', 'serviceOrderItem', itemJoinCondition);
      }
    }

    if (includeDeleted) {
      qb.withDeleted();
    }

    if (statuses?.length) {
      qb.andWhere('serviceOrder.status IN (:...statuses)', { statuses });
    }

    if (priorities?.length) {
      qb.andWhere('serviceOrder.priority IN (:...priorities)', { priorities });
    }

    if (query.clientId !== undefined) {
      const clientId = this.parsePositiveNumber(query.clientId, undefined, 'clientId');
      qb.andWhere('serviceOrder.clientId = :clientId', { clientId });
    }

    if (itemStatuses?.length) {
      qb.andWhere('serviceOrderItem.status IN (:...itemStatuses)', { itemStatuses });
    }

    if (searchTerm) {
      const normalizedSearch = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((expr) => {
          expr
            .where('LOWER(serviceOrder.code) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.serialNumber) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.initialIssue) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.brand) LIKE :search')
            .orWhere('LOWER(serviceOrderItem.model) LIKE :search');
        }),
      ).setParameter('search', normalizedSearch);
    }

    qb.loadRelationCountAndMap(
      'serviceOrder.pendingQuoteItemsCount',
      'serviceOrder.items',
      'pendingItems',
      (countQb) => {
        if (!includeDeleted) {
          countQb.andWhere('pendingItems.deletedAt IS NULL');
        }
        return countQb.andWhere('pendingItems.status = :pendingStatus', {
          pendingStatus: ServiceOrderItemStatus.DIAGNOSED,
        });
      },
    );

    qb.loadRelationCountAndMap(
      'serviceOrder.rejectedQuoteItemsCount',
      'serviceOrder.items',
      'rejectedItems',
      (countQb) => {
        if (!includeDeleted) {
          countQb.andWhere('rejectedItems.deletedAt IS NULL');
        }
        return countQb.andWhere('rejectedItems.status IN (:...rejectedStatuses)', {
          rejectedStatuses: [
            ServiceOrderItemStatus.CLIENT_REJECTED,
            ServiceOrderItemStatus.CLOSED_REJECTED_CLIENT,
          ],
        });
      },
    );

    qb.loadRelationCountAndMap(
      'serviceOrder.pendingDeliveryItemsCount',
      'serviceOrder.items',
      'deliveryItems',
      (countQb) => {
        if (!includeDeleted) {
          countQb.andWhere('deliveryItems.deletedAt IS NULL');
        }
        return countQb.andWhere('deliveryItems.status = :deliveryStatus', {
          deliveryStatus: ServiceOrderItemStatus.REPAIRED,
        });
      },
    );

    const fromDate = this.parseDate(query.from, 'from');
    if (fromDate) {
      qb.andWhere('serviceOrder.createdAt >= :from', { from: fromDate });
    }

    const toDate = this.parseDate(query.to, 'to');
    if (toDate) {
      qb.andWhere('serviceOrder.createdAt <= :to', { to: toDate });
    }

    qb.orderBy('serviceOrder.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id },
      relations: ['items', 'items.assignedTechnician'],
      withDeleted,
    });

    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }

    return serviceOrder;
  }

  async update(id: number, dto: UpdateServiceOrderDto): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }

    const requestOrigin = dto.requestOrigin ?? serviceOrder.requestOrigin ?? RequestOrigin.CLIENT;

    if (dto.requestOrigin !== undefined) {
      serviceOrder.requestOrigin = requestOrigin;
    }

    if (dto.clientId !== undefined || dto.requestOrigin !== undefined) {
      const client = await this.resolveClientForRequest(
        dto.clientId ?? serviceOrder.clientId ?? undefined,
        requestOrigin,
      );
      serviceOrder.clientId = client?.id ?? null;
      this.applyClientSnapshot(serviceOrder, client);
    }

    if (dto.priority) {
      serviceOrder.priority = dto.priority;
    }

    if (dto.estimatedDeliveryDate !== undefined) {
      serviceOrder.estimatedDeliveryDate = dto.estimatedDeliveryDate
        ? new Date(dto.estimatedDeliveryDate)
        : null;
    }

    if (dto.notes !== undefined) {
      serviceOrder.notes = dto.notes;
    }

    if (dto.isPaid !== undefined) {
      serviceOrder.isPaid = dto.isPaid;
      serviceOrder.paidAt = dto.isPaid ? new Date() : null;
    }

    if (dto.contactName !== undefined) {
      serviceOrder.clientSnapshotName = this.normalizeOptionalSnapshotValue(dto.contactName, 150);
    }

    if (dto.contactEmail !== undefined) {
      serviceOrder.clientSnapshotEmail = this.normalizeOptionalSnapshotValue(dto.contactEmail, 150);
    }

    if (dto.contactPhone !== undefined) {
      serviceOrder.clientSnapshotPhone = this.normalizeOptionalSnapshotValue(dto.contactPhone, 20);
    }

    if (dto.items?.length) {
      if ((serviceOrder.items?.length ?? 0) >= 1) {
        throw new BadRequestException('Cada orden de servicio solo puede tener un equipo. Edita el equipo existente.');
      }
      const startingNumber = serviceOrder.items?.length
        ? Math.max(...serviceOrder.items.map((item) => item.itemNumber))
        : 0;
      const now = new Date();
      const newItems = await this.serviceOrderItemService.createItemsWithAutoAssignment(
        dto.items,
        startingNumber,
        now,
      );
      serviceOrder.items = [...(serviceOrder.items ?? []), ...newItems];
      await this.serviceOrderItemService.registerAutoAssignments(newItems);
    }

    this.serviceOrderItemService.applyAggregates(serviceOrder);
    return this.serviceOrderRepository.save(serviceOrder);
  }

  async softDelete(id: number) {
    await this.ensureServiceOrderExists(id);
    await this.serviceOrderRepository.softDelete(id);
    await this.serviceOrderItemRepository
      .createQueryBuilder()
      .softDelete()
      .where('service_order_id = :id', { id })
      .execute();

    return { ok: true, message: `ServiceOrder with id ${id} deleted successfully` };
  }

  async restore(id: number) {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }

    if (!serviceOrder.deletedAt) {
      return { ok: true, message: 'ServiceOrder already active' };
    }

    await this.serviceOrderRepository.restore(id);
    await this.serviceOrderItemRepository
      .createQueryBuilder()
      .restore()
      .where('service_order_id = :id', { id })
      .execute();

    return { ok: true, message: `ServiceOrder with id ${id} restored successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.serviceOrderRepository.find({
      where: { id: In(ids) },
      select: ['id'],
    });

    if (!existing.length) {
      throw new NotFoundException('No service orders found for provided ids');
    }

    const existingIds = existing.map((serviceOrder) => serviceOrder.id);
    await this.serviceOrderRepository.softDelete(existingIds);
    await this.serviceOrderItemRepository
      .createQueryBuilder()
      .softDelete()
      .where('service_order_id IN (:...ids)', { ids: existingIds })
      .execute();

    return { ok: true, message: `${existingIds.length} service orders deleted successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);

    const existing = await this.serviceOrderRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
      select: ['id', 'deletedAt'],
    });

    if (!existing.length) {
      throw new NotFoundException('No service orders found for provided ids');
    }

    const toRestore = existing.filter((serviceOrder) => serviceOrder.deletedAt);
    if (!toRestore.length) {
      return { ok: true, message: 'Service orders already active' };
    }

    const idsToRestore = toRestore.map((serviceOrder) => serviceOrder.id);
    await this.serviceOrderRepository.restore(idsToRestore);
    await this.serviceOrderItemRepository
      .createQueryBuilder()
      .restore()
      .where('service_order_id IN (:...ids)', { ids: idsToRestore })
      .execute();

    return { ok: true, message: `${idsToRestore.length} service orders restored successfully` };
  }

  private async ensureServiceOrderExists(id: number) {
    const exists = await this.serviceOrderRepository.findOne({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }
  }

  private async ensureClient(id: number): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: { documentType: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
    return client;
  }

  private async resolveClientForRequest(clientId: number | undefined, requestOrigin: RequestOrigin) {
    if (requestOrigin === RequestOrigin.INTERNAL) {
      return null;
    }

    if (!clientId) {
      throw new BadRequestException('clientId is required for client-origin service orders');
    }

    return this.ensureClient(clientId);
  }

  private applyClientSnapshot(serviceOrder: ServiceOrder, client: Client | null): void {
    if (!client) {
      serviceOrder.clientSnapshotName = null;
      serviceOrder.clientSnapshotDocumentTypeName = null;
      serviceOrder.clientSnapshotDocumentNumber = null;
      serviceOrder.clientSnapshotPhone = null;
      serviceOrder.clientSnapshotEmail = null;
      return;
    }

    serviceOrder.clientSnapshotName = client.name ?? null;
    serviceOrder.clientSnapshotDocumentTypeName = client.documentType?.name ?? null;
    serviceOrder.clientSnapshotDocumentNumber = client.documentNumber ?? null;
    serviceOrder.clientSnapshotPhone = client.phone ?? null;
    serviceOrder.clientSnapshotEmail = client.email ?? null;
  }

  private normalizeOptionalSnapshotValue(value: string | null | undefined, maxLength: number): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, maxLength);
  }

  private async ensureUser(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
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
      throw new BadRequestException(`${field} contains invalid values: ${invalid.join(', ')}`);
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

  private async generateNextServiceOrderCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const prefix = `SO${year}${month}${day}${hours}${minutes}`;

    const lastServiceOrder = await this.serviceOrderRepository
      .createQueryBuilder('serviceOrder')
      .withDeleted()
      .where('serviceOrder.code LIKE :pattern', { pattern: `${prefix}%` })
      .orderBy('serviceOrder.code', 'DESC')
      .limit(1)
      .getOne();

    if (!lastServiceOrder) {
      return `${prefix}0001`;
    }

    const current = Number(lastServiceOrder.code.slice(prefix.length));
    if (!Number.isFinite(current)) {
      return `${prefix}0001`;
    }

    return `${prefix}${String(current + 1).padStart(4, '0')}`;
  }
}
