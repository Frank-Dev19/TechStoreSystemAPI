import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';

@Injectable()
export class ServiceOrderItemCommercialVersionService {
  async createRediagnosisDraft(
    manager: EntityManager,
    serviceOrderItemId: number,
    createdByUserId: number,
    notes?: string,
  ): Promise<ServiceOrderItemCommercialVersion> {
    const versionRepository = manager.getRepository(ServiceOrderItemCommercialVersion);
    const baseVersion = await versionRepository.findOne({
      where: {
        serviceOrderItemId,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
      },
      relations: ['lines'],
      order: { versionNumber: 'DESC', acceptedAt: 'DESC', createdAt: 'DESC' },
    });
    if (!baseVersion) {
      throw new NotFoundException(
        `No accepted commercial version found for service-order item ${serviceOrderItemId}`,
      );
    }

    const versionNumber = await this.resolveNextVersionNumber(versionRepository, serviceOrderItemId);
    const draft = await versionRepository.save(
      versionRepository.create({
        serviceOrderItemId,
        derivedFromVersionId: baseVersion.id,
        versionNumber,
        status: ServiceOrderItemCommercialVersionStatus.DRAFT,
        totalAmount: Number(baseVersion.totalAmount),
        notes: notes?.trim() || baseVersion.notes,
        createdByUserId,
        acceptedAt: null,
        acceptedByUserId: null,
      }),
    );

    const lineRepository = manager.getRepository(ServiceOrderItemCommercialLine);
    const clonedLines = (baseVersion.lines ?? []).map((line) =>
      lineRepository.create({
        commercialVersionId: draft.id,
        type: line.type,
        productId: line.productId,
        serviceId: line.serviceId,
        catalogCodeSnapshot: line.catalogCodeSnapshot,
        catalogNameSnapshot: line.catalogNameSnapshot,
        catalogDescriptionSnapshot: line.catalogDescriptionSnapshot,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        grossAmount: Number(line.grossAmount),
        discountAmount: Number(line.discountAmount),
        netAmount: Number(line.netAmount),
        requiresPurchase: line.requiresPurchase,
        notes: line.notes,
      }),
    );
    if (clonedLines.length) await lineRepository.save(clonedLines);
    draft.lines = clonedLines;
    return draft;
  }

  async acceptDraft(
    manager: EntityManager,
    versionId: number,
    acceptedByUserId: number,
  ): Promise<ServiceOrderItemCommercialVersion> {
    const repository = manager.getRepository(ServiceOrderItemCommercialVersion);
    const draft = await repository.findOne({
      where: { id: versionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!draft) throw new NotFoundException(`Commercial version with id ${versionId} not found`);
    if (
      ![
        ServiceOrderItemCommercialVersionStatus.DRAFT,
        ServiceOrderItemCommercialVersionStatus.ISSUED,
      ].includes(draft.status)
    ) {
      throw new BadRequestException('Only draft or issued commercial versions can be accepted');
    }

    await repository
      .createQueryBuilder()
      .update()
      .set({ status: ServiceOrderItemCommercialVersionStatus.REPLACED })
      .where('service_order_item_id = :serviceOrderItemId', {
        serviceOrderItemId: draft.serviceOrderItemId,
      })
      .andWhere('id <> :id', { id: draft.id })
      .andWhere('status = :status', { status: ServiceOrderItemCommercialVersionStatus.ACCEPTED })
      .execute();

    draft.status = ServiceOrderItemCommercialVersionStatus.ACCEPTED;
    draft.acceptedAt = new Date();
    draft.acceptedByUserId = acceptedByUserId;
    return repository.save(draft);
  }

  private async resolveNextVersionNumber(
    repository: Repository<ServiceOrderItemCommercialVersion>,
    serviceOrderItemId: number,
  ): Promise<number> {
    const raw = await repository
      .createQueryBuilder('commercialVersion')
      .select('MAX(commercialVersion.versionNumber)', 'max')
      .where('commercialVersion.serviceOrderItemId = :serviceOrderItemId', { serviceOrderItemId })
      .getRawOne<{ max: string | null } | undefined>();
    return (Number(raw?.max ?? null) || 0) + 1;
  }
}
