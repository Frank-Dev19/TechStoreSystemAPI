import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ServiceOrderDiagnosis } from './entities/service-order-diagnosis.entity';
import { CreateServiceOrderDiagnosisDto } from './dto/create-service-order-diagnosis.dto';
import { UpdateServiceOrderDiagnosisDto } from './dto/update-service-order-diagnosis.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderDiagnosisStatus } from './service-order-diagnosis-status.enum';
import { ServiceOrderDiagnosisOutcome } from './service-order-diagnosis-outcome.enum';
import { ServiceOrderWorkflowService } from '../services/service-order-workflow.service';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { ServiceOrderCommercialStatus, ServiceOrderTechnicalStatus } from '../enums';
import { ServiceType } from '../enums/service-type.enum';

type FindDiagnosisQuery = {
  page?: number | string;
  limit?: number | string;
  serviceOrderId?: number | string;
  status?: string;
  withDeleted?: string;
};

@Injectable()
export class ServiceOrderDiagnosisService {
  constructor(
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly diagnosisRepository: Repository<ServiceOrderDiagnosis>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    private readonly workflowService: ServiceOrderWorkflowService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
  ) {}

  async findAll(query: FindDiagnosisQuery) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<ServiceOrderDiagnosisStatus>(
      query.status,
      ServiceOrderDiagnosisStatus,
      'status',
    );

    const qb = this.diagnosisRepository
      .createQueryBuilder('serviceOrderDiagnosis')
      .orderBy('serviceOrderDiagnosis.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.withDeleted === 'true') {
      qb.withDeleted();
    }

    if (query.serviceOrderId !== undefined) {
      const serviceOrderId = this.parsePositiveNumber(query.serviceOrderId, undefined, 'serviceOrderId');
      qb.andWhere('serviceOrderDiagnosis.serviceOrderId = :serviceOrderId', { serviceOrderId });
    }

    if (statuses?.length) {
      qb.andWhere('serviceOrderDiagnosis.status IN (:...statuses)', { statuses });
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
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }

    return diagnosis;
  }

  async create(dto: CreateServiceOrderDiagnosisDto) {
    const serviceOrder = await this.ensureServiceOrder(dto.serviceOrderId);
    this.ensureDiagnosisCreateAllowed(serviceOrder);
    const previousCurrentDiagnosis = await this.diagnosisRepository.findOne({
      where: {
        serviceOrderId: dto.serviceOrderId,
        status: ServiceOrderDiagnosisStatus.CURRENT,
      },
      order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
    });

    const diagnosis = await this.diagnosisRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceOrderDiagnosis);
      const sequenceNumber = dto.sequenceNumber ?? (await this.resolveNextSequence(repository, dto.serviceOrderId));

      await repository
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderDiagnosisStatus.SUPERSEDED })
        .where('service_order_id = :serviceOrderId', { serviceOrderId: dto.serviceOrderId })
        .andWhere('status = :status', { status: ServiceOrderDiagnosisStatus.CURRENT })
        .execute();

      const entity = repository.create({
        serviceOrderId: dto.serviceOrderId,
        sequenceNumber,
        status: ServiceOrderDiagnosisStatus.CURRENT,
        outcome: dto.outcome ?? ServiceOrderDiagnosisOutcome.REPAIRABLE,
        summary: dto.summary,
        details: dto.details ?? null,
        outcomeReason: dto.outcomeReason ?? null,
        recommendedAction: dto.recommendedAction ?? null,
      });

      return repository.save(entity);
    });

    const nextTechnicalStatus = this.resolveTechnicalStatusFromOutcome(diagnosis.outcome);
    await this.workflowService.changeTechnicalStatus(dto.serviceOrderId, nextTechnicalStatus);
    await this.applyCommercialStatusFromDiagnosis(dto.serviceOrderId, diagnosis.outcome);
    await this.messageMatrixService.notifyDiagnosisUpdated(
      await this.ensureServiceOrder(dto.serviceOrderId),
      diagnosis,
      previousCurrentDiagnosis,
    );
    return diagnosis;
  }

  async update(id: number, dto: UpdateServiceOrderDiagnosisDto) {
    const diagnosis = await this.diagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }

    if (diagnosis.deletedAt) {
      throw new BadRequestException('Cannot update a deleted diagnosis');
    }

    if (dto.summary !== undefined) diagnosis.summary = dto.summary;
    if (dto.details !== undefined) diagnosis.details = dto.details;
    if (dto.sequenceNumber !== undefined) diagnosis.sequenceNumber = dto.sequenceNumber;
    if (dto.outcome !== undefined) diagnosis.outcome = dto.outcome;
    if (dto.outcomeReason !== undefined) diagnosis.outcomeReason = dto.outcomeReason ?? null;
    if (dto.recommendedAction !== undefined) diagnosis.recommendedAction = dto.recommendedAction ?? null;

    return this.diagnosisRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceOrderDiagnosis);

      if (dto.status === ServiceOrderDiagnosisStatus.CURRENT) {
        await repository
          .createQueryBuilder()
          .update()
          .set({ status: ServiceOrderDiagnosisStatus.SUPERSEDED })
          .where('service_order_id = :serviceOrderId', { serviceOrderId: diagnosis.serviceOrderId })
          .andWhere('id <> :id', { id: diagnosis.id })
          .andWhere('status = :status', { status: ServiceOrderDiagnosisStatus.CURRENT })
          .execute();
        diagnosis.status = ServiceOrderDiagnosisStatus.CURRENT;
      } else if (dto.status === ServiceOrderDiagnosisStatus.SUPERSEDED) {
        diagnosis.status = ServiceOrderDiagnosisStatus.SUPERSEDED;
      }

      return repository.save(diagnosis);
    });
  }

  async softDelete(id: number) {
    await this.ensureDiagnosis(id);
    await this.diagnosisRepository.softDelete(id);
    return { ok: true, message: `ServiceOrderDiagnosis ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    this.ensureIds(ids);
    await this.diagnosisRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} service order diagnoses deleted successfully` };
  }

  async restore(id: number) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }

    if (!diagnosis.deletedAt) {
      return { ok: true, message: 'ServiceOrderDiagnosis already active' };
    }

    await this.diagnosisRepository.restore(id);
    return { ok: true, message: `ServiceOrderDiagnosis ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    this.ensureIds(ids);
    const existing = await this.diagnosisRepository.find({
      where: { id: In(ids) },
      withDeleted: true,
    });

    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) {
      throw new NotFoundException('No service order diagnoses found to restore');
    }

    await this.diagnosisRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} service order diagnoses restored successfully` };
  }

  private resolveTechnicalStatusFromOutcome(outcome: ServiceOrderDiagnosisOutcome): ServiceOrderTechnicalStatus {
    return [
      ServiceOrderDiagnosisOutcome.REPAIRABLE,
      ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES,
    ].includes(outcome)
      ? ServiceOrderTechnicalStatus.DIAGNOSTICADA
      : ServiceOrderTechnicalStatus.SIN_SOLUCION;
  }

  private async ensureServiceOrder(id: number) {
    const serviceOrder = await this.serviceOrderRepository.findOne({ where: { id } });
    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }
    return serviceOrder;
  }

  private ensureDiagnosisCreateAllowed(serviceOrder: ServiceOrder) {
    if (serviceOrder.technicalStatus === ServiceOrderTechnicalStatus.EN_DIAGNOSTICO) {
      if (
        ![ServiceType.DIAGNOSIS, ServiceType.WARRANTY_SERVICE].includes(serviceOrder.serviceType)
      ) {
        throw new BadRequestException('Only diagnosis or warranty service orders can register a diagnosis');
      }
      return;
    }

    if (serviceOrder.technicalStatus === ServiceOrderTechnicalStatus.EN_EJECUCION) {
      if (serviceOrder.serviceType !== ServiceType.DIAGNOSIS) {
        throw new BadRequestException('Only diagnosis service orders can create a new diagnosis from IN_SERVICE');
      }
      return;
    }

    throw new BadRequestException(
      `Cannot register a diagnosis while the service order is ${serviceOrder.technicalStatus}`,
    );
  }

  private async applyCommercialStatusFromDiagnosis(
    serviceOrderId: number,
    outcome: ServiceOrderDiagnosisOutcome,
  ): Promise<void> {
    const serviceOrder = await this.ensureServiceOrder(serviceOrderId);

    if (
      [ServiceOrderDiagnosisOutcome.REPAIRABLE, ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES].includes(outcome)
    ) {
      serviceOrder.commercialStatus = ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA;
    } else {
      serviceOrder.commercialStatus = ServiceOrderCommercialStatus.NO_REQUIERE;
    }

    await this.serviceOrderRepository.save(serviceOrder);
  }

  private async ensureDiagnosis(id: number) {
    const diagnosis = await this.diagnosisRepository.findOne({ where: { id } });
    if (!diagnosis) {
      throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    }
  }

  private async resolveNextSequence(
    repository: Repository<ServiceOrderDiagnosis>,
    serviceOrderId: number,
  ) {
    const raw = await repository
      .createQueryBuilder('serviceOrderDiagnosis')
      .select('MAX(serviceOrderDiagnosis.sequenceNumber)', 'max')
      .where('serviceOrderDiagnosis.serviceOrderId = :serviceOrderId', { serviceOrderId })
      .withDeleted()
      .getRawOne<{ max: string | null } | undefined>();

    return (Number(raw?.max ?? null) || 0) + 1;
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
