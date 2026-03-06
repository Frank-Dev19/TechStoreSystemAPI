import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ServiceOrderDiagnosis } from './entities/service-order-diagnosis.entity';
import { CreateServiceOrderDiagnosisDto } from './dto/create-service-order-diagnosis.dto';
import { UpdateServiceOrderDiagnosisDto } from './dto/update-service-order-diagnosis.dto';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderDiagnosisStatus } from './service-order-diagnosis-status.enum';
import { ServiceOrderItemStatus } from '../enums';
import { ServiceOrderItemService } from '../services/service-order-item.service';

type FindDiagnosisQuery = {
  page?: number | string;
  limit?: number | string;
  serviceOrderItemId?: number | string;
  status?: string;
  withDeleted?: string;
};

@Injectable()
export class ServiceOrderDiagnosisService {
  constructor(
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly serviceOrderDiagnosisRepository: Repository<ServiceOrderDiagnosis>,
    @InjectRepository(ServiceOrderItem)
    private readonly serviceOrderItemRepository: Repository<ServiceOrderItem>,
    private readonly serviceOrderItemService: ServiceOrderItemService,
  ) {}

  async findAll(query: FindDiagnosisQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<ServiceOrderDiagnosisStatus>(
      query.status,
      ServiceOrderDiagnosisStatus,
      'status',
    );

    const qb = this.serviceOrderDiagnosisRepository
      .createQueryBuilder('serviceOrderDiagnosis')
      .orderBy('serviceOrderDiagnosis.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.withDeleted === 'true') {
      qb.withDeleted();
    }

    if (query.serviceOrderItemId !== undefined) {
      const serviceOrderItemId = this.parsePositiveNumber(
        query.serviceOrderItemId,
        undefined,
        'serviceOrderItemId',
      );
      qb.andWhere('serviceOrderDiagnosis.serviceOrderItemId = :serviceOrderItemId', { serviceOrderItemId });
    }

    if (statuses?.length) {
      qb.andWhere('serviceOrderDiagnosis.status IN (:...statuses)', { statuses });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false) {
    const diagnosis = await this.serviceOrderDiagnosisRepository.findOne({
      where: { id },
      withDeleted,
    });

    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }

    return diagnosis;
  }

  async create(dto: CreateServiceOrderDiagnosisDto) {
    const serviceOrderItem = await this.ensureServiceOrderItem(dto.serviceOrderItemId);

    const diagnosis = await this.serviceOrderDiagnosisRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceOrderDiagnosis);
      const sequenceNumber =
        dto.sequenceNumber ??
        (await this.resolveNextSequence(repository, dto.serviceOrderItemId));

      await repository
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderDiagnosisStatus.ARCHIVED })
        .where('service_order_item_id = :serviceOrderItemId', { serviceOrderItemId: dto.serviceOrderItemId })
        .andWhere('status = :status', { status: ServiceOrderDiagnosisStatus.CURRENT })
        .execute();

      const entity = repository.create({
        serviceOrderItemId: dto.serviceOrderItemId,
        sequenceNumber,
        status: ServiceOrderDiagnosisStatus.CURRENT,
        summary: dto.summary,
        details: dto.details ?? null,
      });

      return repository.save(entity);
    });

    await this.transitionServiceOrderItemStatus(serviceOrderItem.id, ServiceOrderItemStatus.DIAGNOSED, [
      ServiceOrderItemStatus.IN_DIAGNOSIS,
    ]);

    return diagnosis;
  }

  async update(id: number, dto: UpdateServiceOrderDiagnosisDto) {
    const diagnosis = await this.serviceOrderDiagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }

    if (diagnosis.deletedAt) {
      throw new BadRequestException('Cannot update a deleted diagnosis');
    }

    if (dto.summary !== undefined) {
      diagnosis.summary = dto.summary;
    }
    if (dto.details !== undefined) {
      diagnosis.details = dto.details;
    }
    if (dto.sequenceNumber !== undefined) {
      diagnosis.sequenceNumber = dto.sequenceNumber;
    }

    return this.serviceOrderDiagnosisRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceOrderDiagnosis);

      if (dto.status === ServiceOrderDiagnosisStatus.CURRENT) {
        await repository
          .createQueryBuilder()
          .update()
          .set({ status: ServiceOrderDiagnosisStatus.ARCHIVED })
          .where('service_order_item_id = :serviceOrderItemId', { serviceOrderItemId: diagnosis.serviceOrderItemId })
          .andWhere('id <> :id', { id: diagnosis.id })
          .andWhere('status = :status', { status: ServiceOrderDiagnosisStatus.CURRENT })
          .execute();
        diagnosis.status = ServiceOrderDiagnosisStatus.CURRENT;
      } else if (dto.status === ServiceOrderDiagnosisStatus.ARCHIVED) {
        diagnosis.status = ServiceOrderDiagnosisStatus.ARCHIVED;
      }

      return repository.save(diagnosis);
    });
  }

  async softDelete(id: number) {
    await this.ensureDiagnosis(id);
    await this.serviceOrderDiagnosisRepository.softDelete(id);
    return { ok: true, message: `ServiceOrderDiagnosis ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.serviceOrderDiagnosisRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} service order diagnoses deleted successfully` };
  }

  async restore(id: number) {
    const diagnosis = await this.serviceOrderDiagnosisRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }

    if (!diagnosis.deletedAt) {
      return { ok: true, message: 'ServiceOrderDiagnosis already active' };
    }

    await this.serviceOrderDiagnosisRepository.restore(id);
    return { ok: true, message: `ServiceOrderDiagnosis ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    const existing = await this.serviceOrderDiagnosisRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
    });

    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) {
      throw new NotFoundException('No service order diagnoses found to restore');
    }

    await this.serviceOrderDiagnosisRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} service order diagnoses restored successfully` };
  }

  private async ensureServiceOrderItem(id: number) {
    const item = await this.serviceOrderItemRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`ServiceOrderItem with id ${id} not found`);
    }
    return item;
  }

  private async ensureDiagnosis(id: number) {
    const diagnosis = await this.serviceOrderDiagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }
  }

  private async resolveNextSequence(
    repository: Repository<ServiceOrderDiagnosis>,
    serviceOrderItemId: number,
  ) {
    const raw = await repository
      .createQueryBuilder('serviceOrderDiagnosis')
      .select('MAX(serviceOrderDiagnosis.sequenceNumber)', 'max')
      .where('serviceOrderDiagnosis.serviceOrderItemId = :serviceOrderItemId', { serviceOrderItemId })
      .withDeleted()
      .getRawOne<{ max: string | null } | undefined>();

    return (Number(raw?.max ?? null) || 0) + 1;
  }

  private async transitionServiceOrderItemStatus(
    serviceOrderItemId: number,
    targetStatus: ServiceOrderItemStatus,
    allowedStatuses: ServiceOrderItemStatus[],
  ) {
    const item = await this.serviceOrderItemRepository.findOne({ where: { id: serviceOrderItemId } });
    if (!item) {
      return;
    }

    if (!allowedStatuses.includes(item.status) || item.status === targetStatus) {
      return;
    }

    await this.serviceOrderItemService.changeStatus(serviceOrderItemId, targetStatus);
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
}
