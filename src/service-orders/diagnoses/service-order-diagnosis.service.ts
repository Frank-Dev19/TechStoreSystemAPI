import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderCommercialStatus, ServiceOrderTechnicalStatus } from '../enums';
import { ServiceType } from '../enums/service-type.enum';
import { ServiceOrderItemWorkflowService } from '../services/service-order-item-workflow.service';
import { ServiceOrderItemCommercialVersionService } from '../services/service-order-item-commercial-version.service';
import { ServiceOrderMessageMatrixService } from '../services/service-order-message-matrix.service';
import { CreateServiceOrderDiagnosisDto } from './dto/create-service-order-diagnosis.dto';
import { UpdateServiceOrderDiagnosisDto } from './dto/update-service-order-diagnosis.dto';
import { ServiceOrderDiagnosis } from './entities/service-order-diagnosis.entity';
import { ServiceOrderDiagnosisOutcome } from './service-order-diagnosis-outcome.enum';
import { ServiceOrderDiagnosisStatus } from './service-order-diagnosis-status.enum';

type FindDiagnosisQuery = {
  page?: number | string;
  limit?: number | string;
  serviceOrderId?: number | string;
  serviceOrderItemId?: number | string;
  status?: string;
  withDeleted?: string;
};

type DiagnosisViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderDiagnosisService {
  constructor(
    @InjectRepository(ServiceOrderDiagnosis)
    private readonly diagnosisRepository: Repository<ServiceOrderDiagnosis>,
    private readonly itemWorkflowService: ServiceOrderItemWorkflowService,
    private readonly commercialVersionService: ServiceOrderItemCommercialVersionService,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
  ) {}

  async findAll(query: FindDiagnosisQuery, viewer?: DiagnosisViewer) {
    const page = this.parsePositiveNumber(query.page, 1, 'page');
    const limit = this.parsePositiveNumber(query.limit, 10, 'limit', 100);
    const statuses = this.parseEnumList<ServiceOrderDiagnosisStatus>(
      query.status,
      ServiceOrderDiagnosisStatus,
      'status',
    );

    const qb = this.diagnosisRepository
      .createQueryBuilder('serviceOrderDiagnosis')
      .innerJoinAndSelect('serviceOrderDiagnosis.serviceOrderItem', 'serviceOrderItem')
      .innerJoin('serviceOrderItem.serviceOrder', 'serviceOrder')
      .orderBy('serviceOrderDiagnosis.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.withDeleted === 'true') qb.withDeleted();

    if (query.serviceOrderId !== undefined) {
      const serviceOrderId = this.parsePositiveNumber(query.serviceOrderId, undefined, 'serviceOrderId');
      qb.andWhere('serviceOrderItem.serviceOrderId = :serviceOrderId', { serviceOrderId });
    }

    if (query.serviceOrderItemId !== undefined) {
      const serviceOrderItemId = this.parsePositiveNumber(
        query.serviceOrderItemId,
        undefined,
        'serviceOrderItemId',
      );
      qb.andWhere('serviceOrderDiagnosis.serviceOrderItemId = :serviceOrderItemId', {
        serviceOrderItemId,
      });
    }

    if (statuses?.length) {
      qb.andWhere('serviceOrderDiagnosis.status IN (:...statuses)', { statuses });
    }

    this.applyViewerScope(qb, viewer);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, withDeleted = false, viewer?: DiagnosisViewer) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
      withDeleted,
    });
    if (!diagnosis) throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);

    this.ensureViewerCanAccessServiceOrder(diagnosis.serviceOrderItem?.serviceOrder, viewer);
    return diagnosis;
  }

  async create(dto: CreateServiceOrderDiagnosisDto, viewer?: DiagnosisViewer) {
    const result = await this.diagnosisRepository.manager.transaction(async (manager) => {
      const item = await this.resolveItemForCreate(dto, manager);
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: item.serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`ServiceOrder with id ${item.serviceOrderId} not found`);

      this.ensureViewerCanAccessServiceOrder(order, viewer);
      this.ensureDiagnosisCreateAllowed(order, item);

      const repository = manager.getRepository(ServiceOrderDiagnosis);
      const previousCurrentDiagnosis = await repository.findOne({
        where: {
          serviceOrderItemId: item.id,
          status: ServiceOrderDiagnosisStatus.CURRENT,
        },
        order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
      });
      const sequenceNumber =
        dto.sequenceNumber ?? (await this.resolveNextSequence(repository, item.id));

      await repository
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderDiagnosisStatus.SUPERSEDED })
        .where('service_order_item_id = :serviceOrderItemId', { serviceOrderItemId: item.id })
        .andWhere('status = :status', { status: ServiceOrderDiagnosisStatus.CURRENT })
        .execute();

      const diagnosis = await repository.save(
        repository.create({
          serviceOrderItemId: item.id,
          sequenceNumber,
          status: ServiceOrderDiagnosisStatus.CURRENT,
          outcome: dto.outcome ?? ServiceOrderDiagnosisOutcome.REPAIRABLE,
          summary: dto.summary,
          details: dto.details ?? null,
          outcomeReason: dto.outcomeReason ?? null,
          recommendedAction: dto.recommendedAction ?? null,
        }),
      );

      if (
        item.technicalStatus === ServiceOrderTechnicalStatus.EN_EJECUCION &&
        [ServiceOrderDiagnosisOutcome.REPAIRABLE, ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES].includes(
          diagnosis.outcome,
        )
      ) {
        const creatorId = Number(viewer?.sub ?? order.assignedToTechnicianId ?? 0);
        if (!creatorId) throw new BadRequestException('No se pudo identificar al autor del rediagnóstico');
        await this.commercialVersionService.createRediagnosisDraft(
          manager,
          item.id,
          creatorId,
          diagnosis.summary,
        );
      }

      item.commercialStatus = this.resolveCommercialStatusFromOutcome(diagnosis.outcome);
      await manager.getRepository(ServiceOrderItem).save(item);

      const updatedOrder = await this.itemWorkflowService.changeTechnicalStatus(
        order.id,
        item.id,
        this.resolveTechnicalStatusFromOutcome(diagnosis.outcome, item.technicalStatus),
        undefined,
        undefined,
        viewer,
        manager,
      );
      diagnosis.serviceOrderItem = item;
      return { diagnosis, previousCurrentDiagnosis, updatedOrder };
    });

    await this.messageMatrixService.notifyDiagnosisUpdated(
      result.updatedOrder,
      result.diagnosis,
      result.previousCurrentDiagnosis,
    );
    return result.diagnosis;
  }

  async update(id: number, dto: UpdateServiceOrderDiagnosisDto, viewer?: DiagnosisViewer) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
    });
    if (!diagnosis) throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);

    this.ensureViewerCanAccessServiceOrder(diagnosis.serviceOrderItem?.serviceOrder, viewer);
    if (diagnosis.deletedAt) throw new BadRequestException('Cannot update a deleted diagnosis');

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
          .where('service_order_item_id = :serviceOrderItemId', {
            serviceOrderItemId: diagnosis.serviceOrderItemId,
          })
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

  async softDelete(id: number, viewer?: DiagnosisViewer) {
    await this.ensureDiagnosis(id, viewer);
    await this.diagnosisRepository.softDelete(id);
    return { ok: true, message: `ServiceOrderDiagnosis ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[], viewer?: DiagnosisViewer) {
    this.ensureIds(ids);
    await this.ensureDiagnoses(ids, viewer);
    await this.diagnosisRepository.softDelete(ids);
    return { ok: true, message: `${ids.length} service order diagnoses deleted successfully` };
  }

  async restore(id: number, viewer?: DiagnosisViewer) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
      withDeleted: true,
    });
    if (!diagnosis) throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);

    this.ensureViewerCanAccessServiceOrder(diagnosis.serviceOrderItem?.serviceOrder, viewer);
    if (!diagnosis.deletedAt) return { ok: true, message: 'ServiceOrderDiagnosis already active' };

    await this.diagnosisRepository.restore(id);
    return { ok: true, message: `ServiceOrderDiagnosis ${id} restored successfully` };
  }

  async bulkRestore(ids: number[], viewer?: DiagnosisViewer) {
    this.ensureIds(ids);
    const existing = await this.diagnosisRepository.find({
      where: { id: In(ids) },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
      withDeleted: true,
    });
    for (const diagnosis of existing) {
      this.ensureViewerCanAccessServiceOrder(diagnosis.serviceOrderItem?.serviceOrder, viewer);
    }

    const toRestore = existing.filter((entry) => entry.deletedAt);
    if (!toRestore.length) throw new NotFoundException('No service order diagnoses found to restore');

    await this.diagnosisRepository.restore(toRestore.map((entry) => entry.id));
    return { ok: true, message: `${toRestore.length} service order diagnoses restored successfully` };
  }

  private async resolveItemForCreate(
    dto: CreateServiceOrderDiagnosisDto,
    manager: EntityManager,
  ): Promise<ServiceOrderItem> {
    const repository = manager.getRepository(ServiceOrderItem);
    let itemId = dto.serviceOrderItemId;

    if (!itemId) {
      const legacyOrderId = Number(dto.serviceOrderId);
      const items = await repository.find({ where: { serviceOrderId: legacyOrderId }, order: { position: 'ASC' } });
      if (items.length !== 1) {
        throw new BadRequestException(
          'serviceOrderItemId es obligatorio cuando la orden tiene cero o varios equipos',
        );
      }
      itemId = items[0].id;
    }

    const item = await repository.findOne({
      where: { id: itemId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item) throw new NotFoundException(`ServiceOrderItem with id ${itemId} not found`);
    if (dto.serviceOrderId && Number(dto.serviceOrderId) !== Number(item.serviceOrderId)) {
      throw new BadRequestException('El equipo no pertenece a la orden indicada');
    }
    return item;
  }

  private ensureDiagnosisCreateAllowed(order: ServiceOrder, item: ServiceOrderItem): void {
    if (item.technicalStatus === ServiceOrderTechnicalStatus.EN_DIAGNOSTICO) {
      if (![ServiceType.DIAGNOSIS, ServiceType.WARRANTY_SERVICE].includes(order.serviceType)) {
        throw new BadRequestException('Only diagnosis or warranty service orders can register a diagnosis');
      }
      return;
    }

    if (item.technicalStatus === ServiceOrderTechnicalStatus.EN_EJECUCION) {
      if (order.serviceType !== ServiceType.DIAGNOSIS) {
        throw new BadRequestException('Only diagnosis service orders can create a new diagnosis from IN_SERVICE');
      }
      return;
    }

    throw new BadRequestException(
      `Cannot register a diagnosis while the service order item is ${item.technicalStatus}`,
    );
  }

  private resolveTechnicalStatusFromOutcome(
    outcome: ServiceOrderDiagnosisOutcome,
    currentTechnicalStatus: ServiceOrderTechnicalStatus,
  ): ServiceOrderTechnicalStatus {
    if (
      currentTechnicalStatus === ServiceOrderTechnicalStatus.EN_EJECUCION &&
      [ServiceOrderDiagnosisOutcome.REPAIRABLE, ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES].includes(outcome)
    ) {
      return ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL;
    }
    return [ServiceOrderDiagnosisOutcome.REPAIRABLE, ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES].includes(outcome)
      ? ServiceOrderTechnicalStatus.DIAGNOSTICADA
      : ServiceOrderTechnicalStatus.SIN_SOLUCION;
  }

  private resolveCommercialStatusFromOutcome(
    outcome: ServiceOrderDiagnosisOutcome,
  ): ServiceOrderCommercialStatus {
    return [ServiceOrderDiagnosisOutcome.REPAIRABLE, ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES].includes(outcome)
      ? ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA
      : ServiceOrderCommercialStatus.NO_REQUIERE;
  }

  private async ensureDiagnosis(id: number, viewer?: DiagnosisViewer) {
    const diagnosis = await this.diagnosisRepository.findOne({
      where: { id },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
    });
    if (!diagnosis) throw new NotFoundException(`ServiceOrderDiagnosis with id ${id} not found`);
    this.ensureViewerCanAccessServiceOrder(diagnosis.serviceOrderItem?.serviceOrder, viewer);
  }

  private async ensureDiagnoses(ids: number[], viewer?: DiagnosisViewer) {
    const diagnoses = await this.diagnosisRepository.find({
      where: { id: In(ids) },
      relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
    });
    for (const diagnosis of diagnoses) {
      this.ensureViewerCanAccessServiceOrder(diagnosis.serviceOrderItem?.serviceOrder, viewer);
    }
  }

  private applyViewerScope(
    qb: SelectQueryBuilder<ServiceOrderDiagnosis>,
    viewer?: DiagnosisViewer,
  ): void {
    if (!this.isTechnicianViewer(viewer)) return;
    const technicianId = Number(viewer?.sub ?? 0);
    if (!technicianId) throw new ForbiddenException('Usuario tecnico no identificado');
    qb.andWhere('serviceOrder.assignedToTechnicianId = :viewerTechnicianId', {
      viewerTechnicianId: technicianId,
    });
  }

  private ensureViewerCanAccessServiceOrder(
    serviceOrder: ServiceOrder | null | undefined,
    viewer?: DiagnosisViewer,
  ): void {
    if (!this.isTechnicianViewer(viewer)) return;
    const technicianId = Number(viewer?.sub ?? 0);
    if (!technicianId) throw new ForbiddenException('Usuario tecnico no identificado');
    if (!serviceOrder || Number(serviceOrder.assignedToTechnicianId) !== technicianId) {
      throw new ForbiddenException('No tienes acceso a esta orden de servicio');
    }
  }

  private isTechnicianViewer(viewer?: DiagnosisViewer): boolean {
    return isTechnicianScopedRoleSet(viewer?.roles);
  }

  private async resolveNextSequence(
    repository: Repository<ServiceOrderDiagnosis>,
    serviceOrderItemId: number,
  ): Promise<number> {
    const raw = await repository
      .createQueryBuilder('serviceOrderDiagnosis')
      .select('MAX(serviceOrderDiagnosis.sequenceNumber)', 'max')
      .where('serviceOrderDiagnosis.serviceOrderItemId = :serviceOrderItemId', { serviceOrderItemId })
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
      if (fallback !== undefined) return fallback;
      throw new BadRequestException(`${field} is required`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    const normalized = Math.floor(parsed);
    return max && normalized > max ? max : normalized;
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
    if (!ids?.length) throw new BadRequestException('No ids provided');
  }
}
