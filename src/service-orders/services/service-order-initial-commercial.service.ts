import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { PricingEngineService } from '../../pricing/services/pricing-engine.service';
import {
  CreateServiceOrderInitialCommercialLineDto,
  CreateServiceOrderItemDto,
} from '../dto/create-service-order-aggregate.dto';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceType } from '../enums';
import { ServiceOrderAgreementItem } from '../service-agreements/entities/service-agreement-item.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementSource } from '../service-agreements/service-agreement-source.enum';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';
import { WarrantyDurationUnit } from '../../common/enums/warranty-duration-unit.enum';
import { DEFAULT_SERVICE_WARRANTY_DURATION } from '../../warranties/warranty.constants';

const TECHNICAL_SERVICE_CODE = 'TECHNICAL_SERVICE';
const TECHNICAL_SERVICE_NAME = 'Servicio técnico';

@Injectable()
export class ServiceOrderInitialCommercialService {
  constructor(private readonly pricingEngineService: PricingEngineService) {}

  async createForDirectService(
    manager: EntityManager,
    order: ServiceOrder,
    savedItems: ServiceOrderItem[],
    itemInputs: CreateServiceOrderItemDto[],
    creatorId: number,
  ): Promise<ServiceOrderAgreement> {
    if (![ServiceType.STANDARD_SERVICE, ServiceType.ASSEMBLY].includes(order.serviceType)) {
      throw new BadRequestException('Initial commercial content is only valid for direct services');
    }
    if (savedItems.length !== itemInputs.length) {
      throw new BadRequestException('Saved items do not match the initial commercial payload');
    }
    const missingCommercialIndex = itemInputs.findIndex((item) => !item.initialCommercial?.lines?.length);
    if (missingCommercialIndex >= 0) {
      throw new BadRequestException(
        `Initial commercial lines are required for service-order item ${missingCommercialIndex + 1}`,
      );
    }

    const productIds = itemInputs.flatMap((item) =>
      (item.initialCommercial?.lines ?? [])
        .filter((line) => line.type === ServiceOrderCommercialLineType.PRODUCT)
        .map((line) => Number(line.productId)),
    );
    const products = productIds.length
      ? await manager.getRepository(Product).find({ where: { id: In([...new Set(productIds)]) } })
      : [];
    const productMap = new Map(products.map((product) => [Number(product.id), product]));
    const missingProductId = productIds.find((productId) => !productMap.has(productId));
    if (missingProductId) {
      throw new NotFoundException(`Product with id ${missingProductId} not found`);
    }

    const versionRepository = manager.getRepository(ServiceOrderItemCommercialVersion);
    const lineRepository = manager.getRepository(ServiceOrderItemCommercialLine);
    const acceptedAt = new Date();
    const versions: ServiceOrderItemCommercialVersion[] = [];
    const versionTotals: number[] = [];

    for (let index = 0; index < savedItems.length; index += 1) {
      const item = savedItems[index];
      const input = itemInputs[index];
      const commercial = input.initialCommercial!;
      const lines = await Promise.all(
        commercial.lines.map((line) => this.buildLine(line, productMap)),
      );
      const totalAmount = this.calculateTotal(lines);
      const version = await versionRepository.save(
        versionRepository.create({
          serviceOrderItemId: item.id,
          versionNumber: 1,
          status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
          totalAmount,
          warrantyDurationValue: input.warrantyDurationValue ?? DEFAULT_SERVICE_WARRANTY_DURATION,
          warrantyDurationUnit: input.warrantyDurationUnit ?? WarrantyDurationUnit.DAY,
          notes: commercial.notes ?? input.notes ?? null,
          createdByUserId: creatorId,
          acceptedAt,
          acceptedByUserId: creatorId,
        }),
      );
      await lineRepository.save(
        lines.map((line) => lineRepository.create({ ...line, commercialVersionId: version.id })),
      );
      versions.push(version);
      versionTotals.push(totalAmount);
    }

    const totalAmount = Number(versionTotals.reduce((sum, versionTotal) => sum + versionTotal, 0).toFixed(2));
    const agreementRepository = manager.getRepository(ServiceOrderAgreement);
    const agreement = await agreementRepository.save(
      agreementRepository.create({
        serviceOrderId: order.id,
        diagnosisId: null,
        derivedFromAgreementId: null,
        sequenceNumber: 1,
        status: ServiceOrderAgreementStatus.CONFIRMED,
        source: ServiceOrderAgreementSource.RECEPTION_DIRECT,
        totalAmount,
        notes: order.notes ?? null,
        agreedAt: acceptedAt,
        agreedByUserId: creatorId,
      }),
    );
    const agreementItemRepository = manager.getRepository(ServiceOrderAgreementItem);
    await agreementItemRepository.save(
      savedItems.map((item, index) =>
        agreementItemRepository.create({
          serviceOrderAgreementId: agreement.id,
          serviceOrderItemId: item.id,
          commercialVersionId: versions[index].id,
        }),
      ),
    );
    return agreement;
  }

  private async buildLine(
    input: CreateServiceOrderInitialCommercialLineDto,
    productMap: Map<number, Product>,
  ): Promise<Omit<ServiceOrderItemCommercialLine, 'id' | 'commercialVersionId' | 'commercialVersion' | 'product' | 'createdAt'>> {
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    const grossAmount = Number((quantity * unitPrice).toFixed(2));
    if (input.type === ServiceOrderCommercialLineType.PRODUCT) {
      const product = productMap.get(Number(input.productId));
      if (!product) throw new NotFoundException(`Product with id ${input.productId} not found`);
      const pricing = await this.pricingEngineService.calculatePrice(product.id);
      if (unitPrice < pricing.minAllowedPrice) {
        throw new BadRequestException(
          `El precio de ${product.name} no puede ser menor a S/ ${pricing.minAllowedPrice.toFixed(2)}`,
        );
      }
      return {
        type: input.type,
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
        requiresPurchase: input.requiresPurchase ?? false,
        notes: input.notes ?? null,
      };
    }
    if (input.type !== ServiceOrderCommercialLineType.SERVICE) {
      throw new BadRequestException('Adjustment lines are not allowed during service-order intake');
    }
    return {
      type: input.type,
      productId: null,
      serviceId: input.serviceId ?? null,
      catalogCodeSnapshot: TECHNICAL_SERVICE_CODE,
      catalogNameSnapshot: TECHNICAL_SERVICE_NAME,
      catalogDescriptionSnapshot: TECHNICAL_SERVICE_NAME,
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
      notes: input.notes ?? null,
    };
  }

  private calculateTotal(
    lines: Array<Pick<ServiceOrderItemCommercialLine, 'netAmount'>>,
  ): number {
    return Number(lines.reduce((sum, line) => sum + Number(line.netAmount), 0).toFixed(2));
  }
}
