import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCancellationRequest } from '../entities/service-order-item-cancellation-request.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderSaleLink } from '../entities/service-order-sale-link.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderCancellationResolution,
  ServiceOrderCancellationStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { SaleStatus } from '../../sales/enums/sale-status.enum';
import { ServiceOrderAggregateProjectionService } from '../services/service-order-aggregate-projection.service';
import { RecordServiceOrderClientDecisionDto } from './dto/record-service-order-client-decision.dto';
import { ServiceOrderAgreementItem } from './entities/service-agreement-item.entity';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderClientDecision } from './entities/service-order-client-decision.entity';
import { ServiceOrderAgreementStatus } from './service-agreement-status.enum';
import { ServiceOrderClientDecisionType } from './service-order-client-decision-type.enum';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';

type DecisionViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

@Injectable()
export class ServiceOrderCommercialDecisionService {
  constructor(
    private readonly manager: EntityManager,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
  ) {}

  async recordDecision(
    dto: RecordServiceOrderClientDecisionDto,
    viewer?: DecisionViewer,
  ) {
    return this.manager.transaction(async (manager) => {
      const versionRepository = manager.getRepository(
        ServiceOrderItemCommercialVersion,
      );
      const version = await versionRepository.findOne({
        where: { id: dto.commercialVersionId },
        relations: ['serviceOrderItem', 'serviceOrderItem.serviceOrder'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) {
        throw new NotFoundException(
          `Commercial version with id ${dto.commercialVersionId} not found`,
        );
      }

      const linkRepository = manager.getRepository(ServiceOrderAgreementItem);
      const candidateLinks = await linkRepository.find({
        where: { commercialVersionId: version.id },
        relations: ['serviceOrderAgreement'],
      });
      const currentLink = candidateLinks
        .filter(
          (link) =>
            link.serviceOrderAgreement?.status ===
            ServiceOrderAgreementStatus.DRAFT,
        )
        .sort(
          (left, right) =>
            Number(right.serviceOrderAgreement?.sequenceNumber ?? 0) -
            Number(left.serviceOrderAgreement?.sequenceNumber ?? 0),
        )[0];
      if (!currentLink) {
        throw new BadRequestException(
          'La versión comercial no pertenece al consolidado vigente',
        );
      }

      if (
        ![
          ServiceOrderItemCommercialVersionStatus.DRAFT,
          ServiceOrderItemCommercialVersionStatus.ISSUED,
        ].includes(version.status)
      ) {
        throw new BadRequestException(
          'La versión comercial ya no admite nuevas decisiones',
        );
      }

      const item = version.serviceOrderItem;
      const order = item?.serviceOrder;
      if (!item || !order) {
        throw new BadRequestException(
          'No se pudo resolver la orden de la versión comercial',
        );
      }
      this.ensureViewerCanRecord(order.assignedToTechnicianId, viewer);
      const recorderId = Number(viewer?.sub ?? 0);
      if (!recorderId)
        throw new BadRequestException(
          'No se pudo identificar al usuario que registra la decisión',
        );

      const cancellationRepository = manager.getRepository(
        ServiceOrderItemCancellationRequest,
      );
      const cancellationRequest = await cancellationRepository.findOne({
        where: {
          commercialVersionId: version.id,
          status: ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        cancellationRequest &&
        dto.decision === ServiceOrderClientDecisionType.ACCEPTED
      ) {
        await this.assertNoConfirmedSale(manager, order.id);
      }

      const agreementRepository = manager.getRepository(ServiceOrderAgreement);
      const agreement = await agreementRepository.findOne({
        where: { id: currentLink.serviceOrderAgreementId },
        relations: [
          'items',
          'items.commercialVersion',
          'items.serviceOrderItem',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !agreement ||
        agreement.status !== ServiceOrderAgreementStatus.DRAFT
      ) {
        throw new BadRequestException(
          'El acuerdo consolidado ya no está disponible para decisiones',
        );
      }

      const now = new Date();
      const decisionRepository = manager.getRepository(
        ServiceOrderClientDecision,
      );
      const decision = await decisionRepository.save(
        decisionRepository.create({
          commercialVersionId: version.id,
          decision: dto.decision,
          channel: dto.channel,
          observation: dto.observation?.trim() || null,
          recordedByUserId: recorderId,
          recordedAt: now,
        }),
      );

      const itemRepository = manager.getRepository(ServiceOrderItem);
      if (dto.decision === ServiceOrderClientDecisionType.ACCEPTED) {
        await versionRepository
          .createQueryBuilder()
          .update()
          .set({ status: ServiceOrderItemCommercialVersionStatus.REPLACED })
          .where('service_order_item_id = :serviceOrderItemId', {
            serviceOrderItemId: version.serviceOrderItemId,
          })
          .andWhere('id <> :versionId', { versionId: version.id })
          .andWhere('status = :status', {
            status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
          })
          .execute();
        version.status = ServiceOrderItemCommercialVersionStatus.ACCEPTED;
        version.acceptedAt = now;
        version.acceptedByUserId = recorderId;
        await versionRepository.save(version);
        item.commercialStatus = ServiceOrderCommercialStatus.AUTORIZADA;
        if (cancellationRequest) {
          cancellationRequest.status = ServiceOrderCancellationStatus.APPROVED;
          cancellationRequest.resolution =
            ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE;
          cancellationRequest.resolvedAt = now;
          item.operativeStatus = ServiceOrderOperativeStatus.CANCELADA;
          item.cancelledAt = item.cancelledAt ?? now;
          item.cancellationReason = cancellationRequest.reason;
          await cancellationRepository.save(cancellationRequest);
          await itemRepository.save(item);
          await this.recordCancellationAcceptedEvent(
            manager,
            order.id,
            item,
            cancellationRequest,
            recorderId,
          );
        }
      } else {
        item.commercialStatus = ServiceOrderCommercialStatus.RECHAZADA;
        if (cancellationRequest) {
          cancellationRequest.status = ServiceOrderCancellationStatus.PENDING;
          await cancellationRepository.save(cancellationRequest);
        }
      }

      const activeLinks = agreement.items.filter((link) => {
        const linkedItem =
          Number(link.serviceOrderItemId) === Number(item.id)
            ? item
            : link.serviceOrderItem;
        return (
          linkedItem.operativeStatus !== ServiceOrderOperativeStatus.CANCELADA
        );
      });
      const allAccepted = activeLinks.every((link) =>
        Number(link.commercialVersionId) === Number(version.id)
          ? dto.decision === ServiceOrderClientDecisionType.ACCEPTED
          : link.commercialVersion.status ===
            ServiceOrderItemCommercialVersionStatus.ACCEPTED,
      );

      if (allAccepted) {
        const itemsToAuthorize = activeLinks.map((link) => {
          const linkedItem =
            Number(link.serviceOrderItemId) === Number(item.id)
              ? item
              : link.serviceOrderItem;
          if (
            [
              ServiceOrderTechnicalStatus.DIAGNOSTICADA,
              ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
            ].includes(linkedItem.technicalStatus)
          ) {
            linkedItem.technicalStatus =
              ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION;
          }
          return linkedItem;
        });
        if (itemsToAuthorize.length) {
          await itemRepository.save(itemsToAuthorize);
        }
        agreement.status = ServiceOrderAgreementStatus.CONFIRMED;
        agreement.agreedAt = now;
        agreement.agreedByUserId = recorderId;
        await agreementRepository.save(agreement);

        order.montoComprometidoVigente = Number(agreement.totalAmount ?? 0);
        order.economicStatus =
          order.montoComprometidoVigente > 0
            ? ServiceOrderEconomicStatus.PENDIENTE
            : ServiceOrderEconomicStatus.NO_APLICA;
        await manager.getRepository(ServiceOrder).save(order);
      } else {
        await itemRepository.save(item);
      }

      const projectedOrder = await this.projectionService.recalculateLocked(
        manager,
        order.id,
      );
      return { decision, agreement, item, order: projectedOrder, allAccepted };
    });
  }

  private async assertNoConfirmedSale(
    manager: EntityManager,
    serviceOrderId: number,
  ): Promise<void> {
    const links = await manager.getRepository(ServiceOrderSaleLink).find({
      where: { serviceOrderId },
      relations: ['sale'],
    });
    if (links.some((link) => link.sale?.status === SaleStatus.CONFIRMED)) {
      throw new BadRequestException(
        'La cancelación no puede finalizar mientras exista una venta confirmada. Primero debe anularse o revertirse la venta completa.',
      );
    }
  }

  private async recordCancellationAcceptedEvent(
    manager: EntityManager,
    serviceOrderId: number,
    item: ServiceOrderItem,
    request: ServiceOrderItemCancellationRequest,
    actorId: number,
  ): Promise<void> {
    const repository = manager.getRepository(ServiceOrderEvent);
    await repository.save(
      repository.create({
        serviceOrderId,
        eventType: 'item.cancellation.charge-accepted',
        axis: 'operativo',
        capability: 'item-cancellation',
        fromStatus: ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
        toStatus: ServiceOrderOperativeStatus.CANCELADA,
        actorId,
        reason: request.resolutionReason ?? request.reason,
        payloadJson: {
          serviceOrderItemId: item.id,
          itemCode: item.code,
          cancellationRequestId: request.id,
          commercialVersionId: request.commercialVersionId,
          chargeAmount: request.chargeAmount,
        },
      }),
    );
  }

  private ensureViewerCanRecord(
    assignedToTechnicianId: number | null,
    viewer?: DecisionViewer,
  ): void {
    if (!isTechnicianScopedRoleSet(viewer?.roles)) return;
    const technicianId = Number(viewer?.sub ?? 0);
    if (!technicianId || Number(assignedToTechnicianId) !== technicianId) {
      throw new ForbiddenException(
        'No tienes acceso comercial a esta orden de servicio',
      );
    }
  }
}
