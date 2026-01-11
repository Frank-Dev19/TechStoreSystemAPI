import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TicketItemDiagnosis } from './entities/ticket-item-diagnosis.entity';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { TicketItem } from '../entities/ticket-item.entity';
import { TicketItemCycle } from '../entities/ticket-item-cycle.entity';
import { DiagnosisStatus } from './diagnosis-status.enum';
import { TicketItemCyclePhase, TicketItemStatus } from '../enums';
import { TicketItemService } from '../services/ticket-item.service';

type FindDiagnosisQuery = {
  page?: number | string;
  limit?: number | string;
  ticketItemId?: number | string;
  status?: string;
  withDeleted?: string;
};

@Injectable()
export class DiagnosticsService {
  constructor(
    @InjectRepository(TicketItemDiagnosis)
    private readonly diagnosisRepository: Repository<TicketItemDiagnosis>,
    @InjectRepository(TicketItem)
    private readonly ticketItemRepository: Repository<TicketItem>,
    @InjectRepository(TicketItemCycle)
    private readonly ticketItemCycleRepository: Repository<TicketItemCycle>,
    private readonly ticketItemService: TicketItemService,
  ) {}

  async findAll(query: FindDiagnosisQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<DiagnosisStatus>(
      query.status,
      DiagnosisStatus,
      'status',
    );

    const qb = this.diagnosisRepository
      .createQueryBuilder('diagnosis')
      .orderBy('diagnosis.createdAt', 'DESC')
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
      qb.andWhere('diagnosis.ticketItemId = :ticketItemId', { ticketItemId });
    }

    if (statuses?.length) {
      qb.andWhere('diagnosis.status IN (:...statuses)', { statuses });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      withDeleted,
    });

    if (!diagnosis) {
      throw new NotFoundException(`Diagnosis with id ${id} not found`);
    }

    return diagnosis;
  }

  async create(dto: CreateDiagnosisDto) {
    const ticketItem = await this.ensureTicketItem(dto.ticketItemId);

    const diagnosis = await this.diagnosisRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(TicketItemDiagnosis);
      const cycleRepo = manager.getRepository(TicketItemCycle);
      const nextSequence =
        dto.sequenceNumber ??
        (await this.resolveNextSequence(repo, dto.ticketItemId));

      const activeCycle = await cycleRepo.findOne({
        where: {
          ticketItemId: dto.ticketItemId,
          phase: TicketItemCyclePhase.DIAGNOSIS,
          endedAt: IsNull(),
        },
      });

      await repo
        .createQueryBuilder()
        .update()
        .set({ status: DiagnosisStatus.ARCHIVED })
        .where('ticket_item_id = :ticketItemId', { ticketItemId: dto.ticketItemId })
        .andWhere('status = :status', { status: DiagnosisStatus.CURRENT })
        .execute();

      const entity = repo.create({
        ticketItemId: dto.ticketItemId,
        cycleId: activeCycle?.id ?? null,
        sequenceNumber: nextSequence,
        status: DiagnosisStatus.CURRENT,
        summary: dto.summary,
        details: dto.details ?? null,
      });

      return repo.save(entity);
    });

    await this.transitionTicketItemStatus(ticketItem.id, TicketItemStatus.DIAGNOSED, [
      TicketItemStatus.IN_DIAGNOSIS,
    ]);

    return diagnosis;
  }

  async update(id: number, dto: UpdateDiagnosisDto) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
    });

    if (!diagnosis) {
      throw new NotFoundException(`Diagnosis with id ${id} not found`);
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

    return this.diagnosisRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(TicketItemDiagnosis);
      if (dto.status === DiagnosisStatus.CURRENT) {
        await repo
          .createQueryBuilder()
          .update()
          .set({ status: DiagnosisStatus.ARCHIVED })
          .where('ticket_item_id = :ticketItemId', { ticketItemId: diagnosis.ticketItemId })
          .andWhere('id <> :id', { id: diagnosis.id })
          .andWhere('status = :status', { status: DiagnosisStatus.CURRENT })
          .execute();
        diagnosis.status = DiagnosisStatus.CURRENT;
      } else if (dto.status === DiagnosisStatus.ARCHIVED) {
        diagnosis.status = DiagnosisStatus.ARCHIVED;
      }

      return repo.save(diagnosis);
    });
  }

  async softDelete(id: number) {
    await this.ensureDiagnosis(id);
    await this.diagnosisRepository.softDelete(id);
    return { ok: true, message: `Diagnosis ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.diagnosisRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} diagnoses deleted successfully` };
  }

  async restore(id: number) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!diagnosis) {
      throw new NotFoundException(`Diagnosis with id ${id} not found`);
    }

    if (!diagnosis.deletedAt) {
      return { ok: true, message: 'Diagnosis already active' };
    }

    await this.diagnosisRepository.restore(id);
    return { ok: true, message: `Diagnosis ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    const existing = await this.diagnosisRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
    });

    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) {
      throw new NotFoundException('No diagnoses found to restore');
    }

    await this.diagnosisRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} diagnoses restored successfully` };
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
  }

  private async resolveNextSequence(
    repo: Repository<TicketItemDiagnosis>,
    ticketItemId: number,
  ) {
    const raw = await repo
      .createQueryBuilder('diag')
      .select('MAX(diag.sequenceNumber)', 'max')
      .where('diag.ticketItemId = :ticketItemId', { ticketItemId })
      .withDeleted()
      .getRawOne<{ max: string | null } | undefined>();
    const maxValue = raw?.max ?? null;
    return (Number(maxValue) || 0) + 1;
  }

  private async transitionTicketItemStatus(
    ticketItemId: number,
    targetStatus: TicketItemStatus,
    allowedStatuses: TicketItemStatus[],
  ) {
    const item = await this.ticketItemRepository.findOne({ where: { id: ticketItemId } });
    if (!item) {
      return;
    }

    if (!allowedStatuses.includes(item.status) || item.status === targetStatus) {
      return;
    }

    await this.ticketItemService.changeStatus(ticketItemId, targetStatus);
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
