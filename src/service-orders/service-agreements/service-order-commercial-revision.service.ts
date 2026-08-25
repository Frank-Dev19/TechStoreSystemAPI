import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In, Repository } from 'typeorm';
import { isTechnicianScopedRoleSet } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { Product } from '../../inventory/entities/product.entity';
import { PricingConfigService } from '../../pricing/services/pricing-config.service';
import { PricingEngineService } from '../../pricing/services/pricing-engine.service';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderOperativeStatus,
} from '../enums';
import { ServiceOrderAggregateProjectionService } from '../services/service-order-aggregate-projection.service';
import {
  CreateServiceOrderCommercialRevisionDto,
  CreateServiceOrderCommercialRevisionItemDto,
  CreateServiceOrderCommercialRevisionLineDto,
} from './dto/create-service-order-commercial-revision.dto';
import { ServiceOrderAgreementItem } from './entities/service-agreement-item.entity';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderLineDiscount } from './entities/service-order-line-discount.entity';
import { ServiceOrderAgreementSource } from './service-agreement-source.enum';
import { ServiceOrderAgreementStatus } from './service-agreement-status.enum';
import { ServiceOrderCommercialLineType } from './service-order-commercial-line-type.enum';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';

type RevisionViewer = Pick<JwtPayload, 'sub' | 'roles'> | undefined;

type CommercialLineInput = Omit<
  ServiceOrderItemCommercialLine,
  | 'id'
  | 'commercialVersionId'
  | 'commercialVersion'
  | 'product'
  | 'discounts'
  | 'createdAt'
>;

type DiscountSnapshotInput = Pick<
  ServiceOrderLineDiscount,
  | 'pricingConfigId'
  | 'ruleName'
  | 'type'
  | 'percentage'
  | 'amount'
  | 'maxAllowedPct'
  | 'wasLimitOverridden'
  | 'overrideReason'
  | 'appliedByUserId'
  | 'authorizedByUserId'
>;

interface PreparedCommercialLine {
  line: CommercialLineInput;
  discount: DiscountSnapshotInput | null;
}

@Injectable()
export class ServiceOrderCommercialRevisionService {
  constructor(
    private readonly manager: EntityManager,
    private readonly projectionService: ServiceOrderAggregateProjectionService,
    private readonly pricingConfigService: PricingConfigService,
    private readonly pricingEngineService: PricingEngineService,
  ) {}

  async createRevision(
    dto: CreateServiceOrderCommercialRevisionDto,
    viewer?: RevisionViewer,
  ) {
    this.ensureUniqueEditedItems(dto.items);

    return this.manager.transaction(async (manager) => {
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: dto.serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order)
        throw new NotFoundException(
          `ServiceOrder with id ${dto.serviceOrderId} not found`,
        );
      this.ensureViewerCanEdit(order, viewer);

      const itemRepository = manager.getRepository(ServiceOrderItem);
      const allItems = await itemRepository.find({
        where: { serviceOrderId: order.id },
        order: { position: 'ASC' },
      });
      const activeItems = allItems.filter(
        (item) =>
          ![
            ServiceOrderOperativeStatus.CANCELADA,
            ServiceOrderOperativeStatus.ENTREGADA,
            ServiceOrderOperativeStatus.CERRADA_SIN_SOLUCION,
          ].includes(item.operativeStatus),
      );
      if (!activeItems.length)
        throw new BadRequestException(
          'La orden no tiene equipos activos para cotizar',
        );

      const activeIds = new Set(activeItems.map((item) => Number(item.id)));
      const invalidEditedItem = dto.items.find(
        (item) => !activeIds.has(Number(item.serviceOrderItemId)),
      );
      if (invalidEditedItem) {
        throw new BadRequestException(
          `El equipo ${invalidEditedItem.serviceOrderItemId} no está activo o no pertenece a la orden`,
        );
      }

      const editedByItemId = new Map(
        dto.items.map((item) => [Number(item.serviceOrderItemId), item]),
      );
      const productMap = await this.loadProducts(manager, dto.items);
      const selectedVersions: Array<{
        item: ServiceOrderItem;
        version: ServiceOrderItemCommercialVersion;
      }> = [];

      for (const item of activeItems) {
        const edit = editedByItemId.get(Number(item.id));
        if (edit) {
          const version = await this.createEditedVersion(
            manager,
            item,
            edit,
            productMap,
            viewer,
            order,
          );
          item.commercialStatus =
            ServiceOrderCommercialStatus.PENDIENTE_PROPUESTA;
          await itemRepository.save(item);
          selectedVersions.push({ item, version });
          continue;
        }

        const currentVersion = await this.findCurrentVersion(manager, item.id);
        if (!currentVersion) {
          throw new BadRequestException(
            `No se puede consolidar la revisión porque el equipo activo ${item.code} aún no tiene versión comercial`,
          );
        }
        selectedVersions.push({ item, version: currentVersion });
      }

      const agreementRepository = manager.getRepository(ServiceOrderAgreement);
      const currentAgreement = await agreementRepository.findOne({
        where: {
          serviceOrderId: order.id,
          status: In([
            ServiceOrderAgreementStatus.DRAFT,
            ServiceOrderAgreementStatus.CONFIRMED,
          ]),
        },
        order: { sequenceNumber: 'DESC', createdAt: 'DESC' },
      });

      await agreementRepository
        .createQueryBuilder()
        .update()
        .set({ status: ServiceOrderAgreementStatus.SUPERSEDED })
        .where('service_order_id = :serviceOrderId', {
          serviceOrderId: order.id,
        })
        .andWhere('status = :status', {
          status: ServiceOrderAgreementStatus.DRAFT,
        })
        .execute();

      const totalAmount = Number(
        selectedVersions
          .reduce(
            (sum, selected) => sum + Number(selected.version.totalAmount),
            0,
          )
          .toFixed(2),
      );
      const agreement = await agreementRepository.save(
        agreementRepository.create({
          serviceOrderId: order.id,
          diagnosisId: null,
          derivedFromAgreementId: currentAgreement?.id ?? null,
          sequenceNumber: Number(currentAgreement?.sequenceNumber ?? 0) + 1,
          status: ServiceOrderAgreementStatus.DRAFT,
          source: ServiceOrderAgreementSource.TECHNICIAN_COORDINATION,
          totalAmount,
          notes: dto.notes?.trim() || null,
          agreedAt: null,
          agreedByUserId: null,
        }),
      );

      const agreementItemRepository = manager.getRepository(
        ServiceOrderAgreementItem,
      );
      const links = selectedVersions.map(({ item, version }) =>
        agreementItemRepository.create({
          serviceOrderAgreementId: agreement.id,
          serviceOrderItemId: item.id,
          commercialVersionId: version.id,
          serviceOrderItem: item,
          commercialVersion: version,
        }),
      );
      await agreementItemRepository.save(links);
      await this.projectionService.recalculateLocked(manager, order.id);

      agreement.items = links;
      return agreement;
    });
  }

  private async createEditedVersion(
    manager: EntityManager,
    item: ServiceOrderItem,
    edit: CreateServiceOrderCommercialRevisionItemDto,
    productMap: Map<number, Product>,
    viewer: RevisionViewer,
    order: ServiceOrder,
  ): Promise<ServiceOrderItemCommercialVersion> {
    const versionRepository = manager.getRepository(
      ServiceOrderItemCommercialVersion,
    );
    const baseVersion = await this.findCurrentVersion(manager, item.id);
    if (
      edit.baseVersionId &&
      Number(baseVersion?.id) !== Number(edit.baseVersionId)
    ) {
      throw new BadRequestException(
        `La versión base del equipo ${item.code} ya no es la vigente`,
      );
    }

    if (
      baseVersion &&
      [
        ServiceOrderItemCommercialVersionStatus.DRAFT,
        ServiceOrderItemCommercialVersionStatus.ISSUED,
      ].includes(baseVersion.status)
    ) {
      baseVersion.status = ServiceOrderItemCommercialVersionStatus.REPLACED;
      await versionRepository.save(baseVersion);
    }

    const preparedLines = await Promise.all(
      edit.lines.map((line) => this.buildLine(line, productMap, viewer)),
    );
    const totalAmount = Number(
      preparedLines
        .reduce((sum, prepared) => sum + Number(prepared.line.netAmount), 0)
        .toFixed(2),
    );
    const versionNumber = await this.resolveNextVersionNumber(
      versionRepository,
      item.id,
    );
    const creatorId = Number(viewer?.sub ?? order.assignedToTechnicianId ?? 0);
    if (!creatorId)
      throw new BadRequestException(
        'No se pudo identificar al autor de la revisión',
      );

    const version = await versionRepository.save(
      versionRepository.create({
        serviceOrderItemId: item.id,
        derivedFromVersionId: baseVersion?.id ?? null,
        versionNumber,
        status: ServiceOrderItemCommercialVersionStatus.DRAFT,
        totalAmount,
        notes: edit.notes?.trim() || null,
        createdByUserId: creatorId,
        acceptedAt: null,
        acceptedByUserId: null,
      }),
    );
    const lineRepository = manager.getRepository(
      ServiceOrderItemCommercialLine,
    );
    const linesToSave = preparedLines.map((prepared) =>
      lineRepository.create({
        ...prepared.line,
        commercialVersionId: version.id,
      }),
    );
    const savedLines = await lineRepository.save(linesToSave);
    const discountRepository = manager.getRepository(ServiceOrderLineDiscount);
    const discountsToSave = preparedLines.flatMap((prepared, index) =>
      prepared.discount
        ? [
            discountRepository.create({
              ...prepared.discount,
              commercialLineId: savedLines[index].id,
            }),
          ]
        : [],
    );
    const savedDiscounts = discountsToSave.length
      ? await discountRepository.save(discountsToSave)
      : [];
    savedLines.forEach((line) => {
      line.discounts = savedDiscounts.filter(
        (discount) => Number(discount.commercialLineId) === Number(line.id),
      );
    });
    version.lines = savedLines;
    return version;
  }

  private async findCurrentVersion(
    manager: EntityManager,
    serviceOrderItemId: number,
  ) {
    return manager.getRepository(ServiceOrderItemCommercialVersion).findOne({
      where: {
        serviceOrderItemId,
        status: In([
          ServiceOrderItemCommercialVersionStatus.DRAFT,
          ServiceOrderItemCommercialVersionStatus.ISSUED,
          ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        ]),
      },
      relations: ['lines'],
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
    });
  }

  private async loadProducts(
    manager: EntityManager,
    items: CreateServiceOrderCommercialRevisionItemDto[],
  ): Promise<Map<number, Product>> {
    const productIds = items.flatMap((item) =>
      item.lines
        .filter((line) => line.type === ServiceOrderCommercialLineType.PRODUCT)
        .map((line) => Number(line.productId)),
    );
    if (!productIds.length) return new Map();
    const products = await manager.getRepository(Product).find({
      where: { id: In([...new Set(productIds)]) },
    });
    const productMap = new Map(
      products.map((product) => [Number(product.id), product]),
    );
    const missingId = productIds.find((id) => !productMap.has(id));
    if (missingId)
      throw new NotFoundException(`Product with id ${missingId} not found`);
    return productMap;
  }

  private async buildLine(
    line: CreateServiceOrderCommercialRevisionLineDto,
    productMap: Map<number, Product>,
    viewer: RevisionViewer,
  ): Promise<PreparedCommercialLine> {
    if (line.type === ServiceOrderCommercialLineType.ADJUSTMENT) {
      throw new BadRequestException(
        'Las líneas de ajuste se habilitarán con el flujo de descuentos',
      );
    }
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const grossAmount = Number((quantity * unitPrice).toFixed(2));
    const discountPct = Number(line.discountPct ?? 0);
    if (discountPct < 0 || discountPct > 100) {
      throw new BadRequestException('El descuento debe estar entre 0% y 100%');
    }
    if (
      line.type === ServiceOrderCommercialLineType.PRODUCT &&
      discountPct > 0
    ) {
      throw new BadRequestException(
        'Los productos de una cotización no admiten descuentos',
      );
    }

    if (line.type === ServiceOrderCommercialLineType.PRODUCT) {
      const product = productMap.get(Number(line.productId));
      if (!product)
        throw new NotFoundException(
          `Product with id ${line.productId} not found`,
        );
      const pricing = await this.pricingEngineService.calculatePrice(product.id);
      if (unitPrice < pricing.minAllowedPrice) {
        throw new BadRequestException(
          `El precio de ${product.name} no puede ser menor a S/ ${pricing.minAllowedPrice.toFixed(2)}`,
        );
      }
      return {
        line: {
          type: line.type,
          productId: product.id,
          serviceId: null,
          catalogCodeSnapshot: product.sku ?? String(product.id),
          catalogNameSnapshot: product.name,
          catalogDescriptionSnapshot: product.description ?? null,
          quantity,
          unitPrice,
          recommendedPriceSnapshot: pricing.recommendedPrice,
          minimumPriceSnapshot: pricing.minAllowedPrice,
          costSnapshot: pricing.cpp,
          costSourceSnapshot: pricing.costSource,
          grossAmount,
          discountAmount: 0,
          netAmount: grossAmount,
          requiresPurchase: line.requiresPurchase ?? false,
          notes: line.notes?.trim() || null,
        },
        discount: null,
      };
    }

    return this.prepareDiscountedLine(
      {
        type: ServiceOrderCommercialLineType.SERVICE,
        productId: null,
        serviceId: line.serviceId ?? null,
        catalogCodeSnapshot: line.serviceId
          ? `SERVICE-${line.serviceId}`
          : 'TECHNICAL_SERVICE',
        catalogNameSnapshot: 'Servicio técnico',
        catalogDescriptionSnapshot: null,
        quantity,
        unitPrice,
        recommendedPriceSnapshot: null,
        minimumPriceSnapshot: null,
        costSnapshot: null,
        costSourceSnapshot: null,
        grossAmount,
        discountAmount: 0,
        netAmount: grossAmount,
        requiresPurchase: false,
        notes: line.notes?.trim() || null,
      },
      discountPct,
      line.discountOverrideReason,
      viewer,
      null,
    );
  }

  private async prepareDiscountedLine(
    commercialLine: CommercialLineInput,
    discountPct: number,
    overrideReason: string | undefined,
    viewer: RevisionViewer,
    productId: number | null,
  ): Promise<PreparedCommercialLine> {
    if (!discountPct) {
      return { line: commercialLine, discount: null };
    }
    this.ensureViewerHasPermission(
      viewer,
      'service-order-agreement.apply-discount',
      'No tienes permiso para aplicar descuentos comerciales',
    );

    const resolved = productId
      ? await this.pricingConfigService.resolveForProduct(productId)
      : {
          config: await this.pricingConfigService.resolveGlobal(),
          scope: 'global' as const,
        };
    const maxAllowedPct = Number(resolved.config.maxDiscountPct);
    const wasLimitOverridden = discountPct > maxAllowedPct;
    if (wasLimitOverridden) {
      this.ensureViewerHasPermission(
        viewer,
        'service-order-agreement.override-discount-limit',
        `El descuento de ${discountPct}% supera el máximo permitido de ${maxAllowedPct}% y requiere autorización de supervisión`,
        BadRequestException,
      );
      if (!overrideReason?.trim()) {
        throw new BadRequestException(
          'Debes registrar el motivo de la autorización para superar el límite de descuento',
        );
      }
    }

    const appliedByUserId = Number(viewer?.sub ?? 0);
    if (!appliedByUserId) {
      throw new BadRequestException(
        'No se pudo identificar al usuario que aplica el descuento',
      );
    }
    const discountAmount = Number(
      (commercialLine.grossAmount * (discountPct / 100)).toFixed(2),
    );
    commercialLine.discountAmount = discountAmount;
    commercialLine.netAmount = Number(
      (commercialLine.grossAmount - discountAmount).toFixed(2),
    );
    const scopeLabels = {
      product: 'producto',
      category: 'categoría',
      global: 'global',
    } as const;

    return {
      line: commercialLine,
      discount: {
        pricingConfigId: Number(resolved.config.id) || null,
        ruleName: `Límite de descuento ${scopeLabels[resolved.scope]}`,
        type: 'PERCENTAGE',
        percentage: discountPct,
        amount: discountAmount,
        maxAllowedPct,
        wasLimitOverridden,
        overrideReason: wasLimitOverridden ? overrideReason!.trim() : null,
        appliedByUserId,
        authorizedByUserId: wasLimitOverridden ? appliedByUserId : null,
      },
    };
  }

  private ensureViewerHasPermission(
    viewer: RevisionViewer,
    permissionCode: string,
    message: string,
    ExceptionType:
      | typeof ForbiddenException
      | typeof BadRequestException = ForbiddenException,
  ): void {
    const hasPermission = (viewer?.roles ?? []).some((role) =>
      (role.permissions ?? []).some(
        (permission) => permission.code === permissionCode,
      ),
    );
    if (!hasPermission) throw new ExceptionType(message);
  }

  private async resolveNextVersionNumber(
    repository: Repository<ServiceOrderItemCommercialVersion>,
    serviceOrderItemId: number,
  ): Promise<number> {
    const raw = await repository
      .createQueryBuilder('commercialVersion')
      .select('MAX(commercialVersion.versionNumber)', 'max')
      .where('commercialVersion.serviceOrderItemId = :serviceOrderItemId', {
        serviceOrderItemId,
      })
      .getRawOne<{ max: string | null } | undefined>();
    return (Number(raw?.max ?? null) || 0) + 1;
  }

  private ensureUniqueEditedItems(
    items: CreateServiceOrderCommercialRevisionItemDto[],
  ): void {
    const ids = items.map((item) => Number(item.serviceOrderItemId));
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Cada equipo puede aparecer una sola vez por revisión comercial',
      );
    }
  }

  private ensureViewerCanEdit(
    order: ServiceOrder,
    viewer?: RevisionViewer,
  ): void {
    if (!isTechnicianScopedRoleSet(viewer?.roles)) return;
    const technicianId = Number(viewer?.sub ?? 0);
    if (
      !technicianId ||
      Number(order.assignedToTechnicianId) !== technicianId
    ) {
      throw new ForbiddenException(
        'No tienes acceso comercial a esta orden de servicio',
      );
    }
  }
}
