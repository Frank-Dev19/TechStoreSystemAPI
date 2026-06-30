import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { User } from '../../users/entities/user.entity';
import {
  hasRoleName,
  isTechnicianScopedRoleSet,
  TECHNICIAN_ROLE_NAMES,
} from '../../common/constants/role-names';
import { AssignTechnicianDto } from '../dto/assign-technician.dto';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { TechnicianAssignmentBalance } from '../entities/technician-assignment-balance.entity';
import {
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
  ServiceType,
} from '../enums';
import { ServiceOrderTransitionPolicy } from '../state-machines/service-order-transition-policy';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

type TechnicianTypeBalance = {
  assignedCount: number;
  activeCount: number;
  lastAssignedAt: Date | null;
};

type TechnicianAssignmentSnapshot = {
  technicianId: number;
  technicianName: string;
  totalActiveCount: number;
  totalAssignedCount: number;
  byType: Map<ServiceType, TechnicianTypeBalance>;
};

export type TechnicianAssignmentTypeBreakdownRow = {
  serviceType: ServiceType;
  activeCount: number;
  assignedCount: number;
};

export type TechnicianAssignmentSuggestionRow = {
  technicianId: number;
  technicianName: string;
  totalActiveCount: number;
  totalAssignedCount: number;
  activeCountForServiceType: number;
  assignedCountForServiceType: number;
  lastAssignedAt: Date | null;
  activeByType: TechnicianAssignmentTypeBreakdownRow[];
  isSuggested: boolean;
};

export type TechnicianAssignmentSuggestion = {
  serviceType: ServiceType;
  suggestedTechnicianId: number;
  technicians: TechnicianAssignmentSuggestionRow[];
};

type ServiceOrderViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderWorkflowService {
  constructor(
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderEvent)
    private readonly eventRepository: Repository<ServiceOrderEvent>,
    @InjectRepository(TechnicianAssignmentBalance)
    private readonly technicianAssignmentBalanceRepository: Repository<TechnicianAssignmentBalance>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly transitionPolicy: ServiceOrderTransitionPolicy,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
  ) {}

  async autoAssignTechnician(serviceOrderId: number, actorId?: number): Promise<ServiceOrder> {
    const serviceOrder = await this.findOrder(serviceOrderId);
    if (serviceOrder.assignedToTechnicianId) {
      return serviceOrder;
    }
    const suggestion = await this.getAssignmentSuggestion(serviceOrder.serviceType);
    const technicianId = suggestion.suggestedTechnicianId;
    return this.assignTechnician(serviceOrderId, { technicianId }, actorId);
  }

  async getAssignmentSuggestion(
    serviceType: ServiceType,
    manager?: EntityManager,
  ): Promise<TechnicianAssignmentSuggestion> {
    const snapshot = await this.prepareTechnicianAssignmentSnapshot(manager);
    const ranked = this.rankTechnicianCandidates(snapshot, serviceType);
    const suggestedTechnicianId = ranked[0]?.technicianId;

    if (!suggestedTechnicianId) {
      throw new BadRequestException('No hay tecnicos disponibles para asignar ordenes');
    }

    return {
      serviceType,
      suggestedTechnicianId,
      technicians: ranked.map((candidate, index) => {
        const typeBalance = candidate.byType.get(serviceType)!;
        return {
          technicianId: candidate.technicianId,
          technicianName: candidate.technicianName,
          totalActiveCount: candidate.totalActiveCount,
          totalAssignedCount: candidate.totalAssignedCount,
          activeCountForServiceType: typeBalance.activeCount,
          assignedCountForServiceType: typeBalance.assignedCount,
          lastAssignedAt: typeBalance.lastAssignedAt,
          activeByType: Object.values(ServiceType)
            .map((type) => {
              const balance = candidate.byType.get(type)!;
              return {
                serviceType: type,
                activeCount: balance.activeCount,
                assignedCount: balance.assignedCount,
              };
            })
            .filter((entry) => entry.activeCount > 0),
          isSuggested: index === 0,
        };
      }),
    };
  }

  async ensureTechnicianAvailable(id: number): Promise<User> {
    return this.ensureTechnician(id);
  }

  async registerInitialAssignment(serviceOrder: ServiceOrder, actorId?: number, manager?: EntityManager): Promise<void> {
    if (!serviceOrder.assignedToTechnicianId) {
      return;
    }

    await this.adjustTechnicianBalance(
      serviceOrder.assignedToTechnicianId,
      serviceOrder.serviceType,
      1,
      this.isTerminalTechnical(serviceOrder.technicalStatus) ? 0 : 1,
      serviceOrder.assignedAt ?? new Date(),
      manager,
    );

    await this.recordEvent(
      serviceOrder.id,
      'assigned',
      'tecnico',
      'assignment',
      null,
      serviceOrder.technicalStatus,
      actorId,
      null,
      {
        technicianId: serviceOrder.assignedToTechnicianId,
        source: 'created',
      },
      manager,
    );
  }

  async assignTechnician(
    serviceOrderId: number,
    dto: AssignTechnicianDto,
    actorId?: number,
    viewer?: ServiceOrderViewer,
  ): Promise<ServiceOrder> {
    const serviceOrder = await this.findOrder(serviceOrderId);
    this.ensureViewerCanManageOrder(serviceOrder, viewer);
    await this.ensureTechnician(dto.technicianId);

    const previousTechnicianId = serviceOrder.assignedToTechnicianId;
    if (previousTechnicianId === dto.technicianId) {
      return this.findOrder(serviceOrderId);
    }

    const assignedAt = new Date();
    await this.serviceOrderRepository.update(
      { id: serviceOrderId },
      {
        assignedToTechnicianId: dto.technicianId,
        assignedAt,
        technicalStatus: ServiceOrderTechnicalStatus.ASIGNADA,
      },
    );

    if (previousTechnicianId && !this.isTerminalTechnical(serviceOrder.technicalStatus)) {
      await this.adjustTechnicianBalance(previousTechnicianId, serviceOrder.serviceType, 0, -1);
    }
    await this.adjustTechnicianBalance(dto.technicianId, serviceOrder.serviceType, 1, 1, assignedAt);

    await this.recordEvent(serviceOrder.id, 'assigned', 'tecnico', 'assignment', null, ServiceOrderTechnicalStatus.ASIGNADA, actorId, null, {
      technicianId: dto.technicianId,
      previousTechnicianId,
    });
    const updatedOrder = await this.findOrder(serviceOrderId);

    return updatedOrder;
  }

  async changeTechnicalStatus(
    serviceOrderId: number,
    nextStatus: ServiceOrderTechnicalStatus,
    actorId?: number,
    reason?: string,
    viewer?: ServiceOrderViewer,
  ): Promise<ServiceOrder> {
    const serviceOrder = await this.findOrder(serviceOrderId);
    this.ensureViewerCanManageOrder(serviceOrder, viewer);
    const previousTechnicalStatus = serviceOrder.technicalStatus;

    this.transitionPolicy.assertTransition('tecnico', previousTechnicalStatus, nextStatus);

    const now = new Date();
    serviceOrder.technicalStatus = nextStatus;
    this.applyCanonicalStatusesFromTechnicalTransition(serviceOrder, nextStatus, reason, now);
    this.applyLifecycleTimestamps(serviceOrder, nextStatus, reason, now);

    await this.serviceOrderRepository.save(serviceOrder);

    if (serviceOrder.assignedToTechnicianId) {
      const movedToTerminal = !this.isTerminalTechnical(previousTechnicalStatus) && this.isTerminalTechnical(nextStatus);
      const movedOutOfTerminal = this.isTerminalTechnical(previousTechnicalStatus) && !this.isTerminalTechnical(nextStatus);

      if (movedToTerminal) {
        await this.adjustTechnicianBalance(serviceOrder.assignedToTechnicianId, serviceOrder.serviceType, 0, -1);
      } else if (movedOutOfTerminal) {
        await this.adjustTechnicianBalance(serviceOrder.assignedToTechnicianId, serviceOrder.serviceType, 0, 1);
      }
    }

    await this.recordEvent(
      serviceOrder.id,
      'technical.changed',
      'tecnico',
      'workflow',
      previousTechnicalStatus,
      nextStatus,
      actorId,
      reason,
      null,
    );

    const updatedOrder = await this.findOrder(serviceOrderId);
    await this.messageMatrixService.notifyWorkflowTransition(updatedOrder, nextStatus);

    return updatedOrder;
  }

  private async recordEvent(
    serviceOrderId: number,
    eventType: string,
    axis: string | null,
    capability: string | null,
    fromStatus: string | null,
    toStatus: string | null,
    actorId?: number,
    reason?: string | null,
    payloadJson?: Record<string, unknown> | null,
    manager?: EntityManager,
  ) {
    const eventRepository = manager?.getRepository(ServiceOrderEvent) ?? this.eventRepository;
    await eventRepository.save(
      eventRepository.create({
        serviceOrderId,
        eventType,
        axis,
        capability,
        fromStatus,
        toStatus,
        actorId: actorId ?? null,
        reason: reason ?? null,
        payloadJson: payloadJson ?? null,
      }),
    );
  }

  private async findOrder(id: number): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id },
      relations: ['assignedTechnician'],
    });
    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${id} not found`);
    }
    return serviceOrder;
  }

  assertTransitionAllowed(
    currentStatus: ServiceOrderTechnicalStatus,
    nextStatus: ServiceOrderTechnicalStatus,
  ): void {
    this.transitionPolicy.assertTransition('tecnico', currentStatus, nextStatus);
  }

  private ensureViewerCanManageOrder(serviceOrder: ServiceOrder, viewer?: ServiceOrderViewer): void {
    if (!isTechnicianScopedRoleSet(viewer?.roles)) {
      return;
    }

    const technicianId = Number(viewer?.sub ?? 0);
    if (!technicianId) {
      throw new ForbiddenException('Usuario tecnico no identificado');
    }

    if (Number(serviceOrder.assignedToTechnicianId) !== technicianId) {
      throw new ForbiddenException('No tienes acceso a esta orden de servicio');
    }
  }

  private applyCanonicalStatusesFromTechnicalTransition(
    serviceOrder: ServiceOrder,
    nextTechnicalStatus: ServiceOrderTechnicalStatus,
    reason: string | undefined,
    now: Date,
  ): void {
    switch (nextTechnicalStatus) {
      case ServiceOrderTechnicalStatus.ASIGNADA:
        serviceOrder.operativeStatus = ServiceOrderOperativeStatus.ABIERTA;
        break;
      case ServiceOrderTechnicalStatus.DIAGNOSTICADA:
      case ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL:
      case ServiceOrderTechnicalStatus.EN_DIAGNOSTICO:
      case ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION:
      case ServiceOrderTechnicalStatus.EN_EJECUCION:
      case ServiceOrderTechnicalStatus.BLOQUEADA:
      case ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO:
        serviceOrder.operativeStatus = ServiceOrderOperativeStatus.EN_PROCESO;
        break;
      case ServiceOrderTechnicalStatus.RESUELTA:
        serviceOrder.operativeStatus = ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA;
        break;
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        serviceOrder.operativeStatus = ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION;
        if (reason) {
          serviceOrder.cancellationReason = reason;
        }
        break;
      case ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION:
        serviceOrder.operativeStatus = ServiceOrderOperativeStatus.ABIERTA;
        break;
      default:
        break;
    }

    if (nextTechnicalStatus === ServiceOrderTechnicalStatus.RESUELTA) {
      serviceOrder.readyForPickupAt = serviceOrder.readyForPickupAt ?? now;
      serviceOrder.resolvedAt = serviceOrder.resolvedAt ?? now;
    }

    if (nextTechnicalStatus === ServiceOrderTechnicalStatus.SIN_SOLUCION) {
      serviceOrder.resolvedAt = serviceOrder.resolvedAt ?? now;
      serviceOrder.closedAt = serviceOrder.closedAt ?? now;
    }
  }

  private applyLifecycleTimestamps(
    serviceOrder: ServiceOrder,
    nextTechnicalStatus: ServiceOrderTechnicalStatus,
    reason: string | undefined,
    now: Date,
  ): void {
    switch (nextTechnicalStatus) {
      case ServiceOrderTechnicalStatus.EN_DIAGNOSTICO:
        serviceOrder.reviewStartedAt = serviceOrder.reviewStartedAt ?? now;
        break;
      case ServiceOrderTechnicalStatus.EN_EJECUCION:
        serviceOrder.serviceStartedAt = serviceOrder.serviceStartedAt ?? now;
        break;
      case ServiceOrderTechnicalStatus.RESUELTA:
        serviceOrder.serviceCompletedAt = serviceOrder.serviceCompletedAt ?? now;
        serviceOrder.readyForPickupAt = serviceOrder.readyForPickupAt ?? now;
        break;
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        if (serviceOrder.operativeStatus === ServiceOrderOperativeStatus.CANCELADA && reason) {
          serviceOrder.cancelledAt = serviceOrder.cancelledAt ?? now;
        }
        break;
      default:
        break;
    }
  }

  private isTerminalTechnical(status: ServiceOrderTechnicalStatus): boolean {
    return [
      ServiceOrderTechnicalStatus.RESUELTA,
      ServiceOrderTechnicalStatus.SIN_SOLUCION,
    ].includes(status);
  }

  private async prepareTechnicianAssignmentSnapshot(manager?: EntityManager): Promise<TechnicianAssignmentSnapshot[]> {
    const technicians = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.roles', 'role')
      .distinct(true)
      .where('LOWER(role.name) IN (:...roles)', { roles: [...TECHNICIAN_ROLE_NAMES] })
      .andWhere('user.isActive = true')
      .andWhere('user.deletedAt IS NULL')
      .getMany();

    if (!technicians.length) {
      throw new BadRequestException('No hay tecnicos disponibles para asignar ordenes');
    }

    const technicianIds = technicians.map((tech) => tech.id);
    const serviceOrderRepository = manager?.getRepository(ServiceOrder) ?? this.serviceOrderRepository;
    const assignedOrders = await serviceOrderRepository.find({
      where: { assignedToTechnicianId: In(technicianIds) },
        select: {
          assignedToTechnicianId: true,
          serviceType: true,
          technicalStatus: true,
          assignedAt: true,
        },
    });

    return technicians.map((technician) => {
      const byType = new Map<ServiceType, TechnicianTypeBalance>();
      const technicianOrders = assignedOrders.filter(
        (order) => Number(order.assignedToTechnicianId) === Number(technician.id),
      );

      for (const serviceType of Object.values(ServiceType)) {
        const ordersOfType = technicianOrders.filter(
          (order) => order.serviceType === serviceType,
        );
        const activeOrdersOfType = ordersOfType.filter(
          (order) => !this.isTerminalTechnical(order.technicalStatus),
        );
        const lastAssignedAt =
          ordersOfType
            .map((order) => order.assignedAt)
            .filter((value): value is Date => value instanceof Date)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

        const normalized: TechnicianTypeBalance = {
          assignedCount: ordersOfType.length,
          activeCount: activeOrdersOfType.length,
          lastAssignedAt,
        };

        byType.set(serviceType, normalized);
      }

      const totalActiveCount = Array.from(byType.values()).reduce((sum, item) => sum + item.activeCount, 0);
      const totalAssignedCount = Array.from(byType.values()).reduce((sum, item) => sum + item.assignedCount, 0);

      return {
        technicianId: technician.id,
        technicianName: technician.name,
        totalActiveCount,
        totalAssignedCount,
        byType,
      };
    });
  }

  private rankTechnicianCandidates(
    snapshot: TechnicianAssignmentSnapshot[],
    serviceType: ServiceType,
  ): TechnicianAssignmentSnapshot[] {
    const candidates = [...snapshot];
    candidates.sort((a, b) => {
      const aTypeBalance = a.byType.get(serviceType)!;
      const bTypeBalance = b.byType.get(serviceType)!;

      if (aTypeBalance.activeCount !== bTypeBalance.activeCount) {
        return aTypeBalance.activeCount - bTypeBalance.activeCount;
      }
      if (aTypeBalance.assignedCount !== bTypeBalance.assignedCount) {
        return aTypeBalance.assignedCount - bTypeBalance.assignedCount;
      }
      if (a.totalActiveCount !== b.totalActiveCount) {
        return a.totalActiveCount - b.totalActiveCount;
      }
      if (a.totalAssignedCount !== b.totalAssignedCount) {
        return a.totalAssignedCount - b.totalAssignedCount;
      }
      const aLastAssignedAt = aTypeBalance.lastAssignedAt?.getTime() ?? 0;
      const bLastAssignedAt = bTypeBalance.lastAssignedAt?.getTime() ?? 0;
      if (aLastAssignedAt !== bLastAssignedAt) {
        return aLastAssignedAt - bLastAssignedAt;
      }
      return a.technicianId - b.technicianId;
    });
    return candidates;
  }

  private async ensureTechnician(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    if (!user.isActive || user.deletedAt) {
      throw new BadRequestException(`User with id ${id} is not active`);
    }
    if (!hasRoleName(user.roles, TECHNICIAN_ROLE_NAMES)) {
      throw new BadRequestException(`User with id ${id} is not a technician`);
    }
    return user;
  }

  private async ensureBalanceRows(technicianIds: number[], manager?: EntityManager): Promise<void> {
    const balanceRepository = manager?.getRepository(TechnicianAssignmentBalance) ?? this.technicianAssignmentBalanceRepository;
    const existing = await balanceRepository.find({
      where: { technicianId: In(technicianIds) },
      select: ['technicianId', 'serviceType'],
    });

    const existingKeys = new Set(existing.map((entry) => `${entry.technicianId}:${entry.serviceType}`));
    const missing = technicianIds.flatMap((technicianId) =>
        Object.values(ServiceType)
          .filter((serviceType) => !existingKeys.has(`${technicianId}:${serviceType}`))
          .map((serviceType) =>
            balanceRepository.create({
              technicianId,
              serviceType,
              assignedCount: 0,
            activeCount: 0,
            lastAssignedAt: null,
          }),
        ),
    );

    if (missing.length) {
      await balanceRepository.save(missing);
    }
  }

  private async adjustTechnicianBalance(
    technicianId: number,
    serviceType: ServiceType,
    assignedDelta: number,
    activeDelta: number,
    lastAssignedAt?: Date | null,
    manager?: EntityManager,
  ): Promise<void> {
    const balanceRepository = manager?.getRepository(TechnicianAssignmentBalance) ?? this.technicianAssignmentBalanceRepository;
    await this.ensureBalanceRows([technicianId], manager);
    const balance = await balanceRepository.findOne({
      where: { technicianId, serviceType },
    });

    if (!balance) {
      throw new NotFoundException(
        `TechnicianAssignmentBalance for technician ${technicianId} and ${serviceType} not found`,
      );
    }

    balance.assignedCount = Math.max(0, Number(balance.assignedCount ?? 0) + assignedDelta);
    balance.activeCount = Math.max(0, Number(balance.activeCount ?? 0) + activeDelta);

    if (lastAssignedAt) {
      balance.lastAssignedAt = lastAssignedAt;
    }

    await balanceRepository.save(balance);
  }
}
