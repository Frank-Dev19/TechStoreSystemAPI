import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Sale } from '../../sales/entities/sale.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';
import { LinkSaleToServiceOrdersDto } from '../dto/link-sale-to-service-orders.dto';
import { ServiceOrderSaleLink } from '../entities/service-order-sale-link.entity';
import { ServiceOrderEconomicStatus } from '../enums';
import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

type SearchSalesQuery = {
  companyId?: number | string;
  customerId?: number | string;
  documentType?: string;
  search?: string;
  page?: number | string;
  limit?: number | string;
};

@Injectable()
export class ServiceOrderSaleLinkService {
  constructor(
    @InjectRepository(ServiceOrderSaleLink)
    private readonly linkRepository: Repository<ServiceOrderSaleLink>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderAgreement)
    private readonly agreementRepository: Repository<ServiceOrderAgreement>,
    private readonly messageMatrixService: ServiceOrderMessageMatrixService,
  ) {}

  async searchSales(query: SearchSalesQuery) {
    const companyId = Number(query.companyId);
    if (!companyId || Number.isNaN(companyId)) {
      throw new BadRequestException('companyId is required');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.companyId = :companyId', { companyId })
      .andWhere('sale.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: 'CANCELLED' });

    if (query.customerId) {
      qb.andWhere('sale.customerId = :customerId', { customerId: Number(query.customerId) });
    }

    if (query.documentType) {
      qb.andWhere('sale.documentType = :documentType', { documentType: query.documentType });
    }

    const search = String(query.search ?? '').trim().toLowerCase();
    if (search) {
      qb.andWhere(
        '(LOWER(sale.series) LIKE :search OR LOWER(sale.number) LIKE :search OR LOWER(CONCAT(sale.series, \'-\', sale.number)) LIKE :search OR LOWER(customer.name) LIKE :search OR LOWER(customer.documentNumber) LIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('sale.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getLinksByServiceOrderIds(serviceOrderIds: number[]) {
    if (!serviceOrderIds.length) {
      return [];
    }

    return this.linkRepository.find({
      where: {
        serviceOrderId: In(serviceOrderIds.map((id) => Number(id))),
        deletedAt: IsNull(),
      },
      order: { linkedAt: 'DESC' },
    });
  }

  async linkSaleToServiceOrders(dto: LinkSaleToServiceOrdersDto, actor?: string) {
    const sale = await this.saleRepository.findOne({
      where: { id: Number(dto.saleId) },
      relations: ['customer', 'payments', 'items', 'items.product', 'items.service'],
    });

    if (!sale || sale.deletedAt || sale.status === 'CANCELLED') {
      throw new NotFoundException('Documento de venta no disponible para vínculo');
    }

    const serviceOrders = await this.serviceOrderRepository.find({
      where: { id: In(dto.serviceOrderIds.map((id) => Number(id))) },
    });

    if (serviceOrders.length !== dto.serviceOrderIds.length) {
      throw new NotFoundException('Una o más órdenes no existen');
    }

    const distinctClientIds = new Set(serviceOrders.map((order) => Number(order.clientId || 0)));
    if (distinctClientIds.size > 1 || Number(serviceOrders[0].clientId || 0) !== Number(sale.customerId)) {
      throw new BadRequestException('Solo puedes vincular órdenes del mismo cliente del documento');
    }

    const agreements = await this.agreementRepository.find({
      where: {
        serviceOrderId: In(serviceOrders.map((order) => Number(order.id))),
        status: ServiceOrderAgreementStatus.CONFIRMED,
      },
      order: { agreedAt: 'DESC', createdAt: 'DESC' },
      relations: ['productItems', 'serviceItems'],
    });

    const activeAgreementByOrderId = new Map<number, ServiceOrderAgreement>();
    for (const agreement of agreements) {
      if (!activeAgreementByOrderId.has(Number(agreement.serviceOrderId))) {
        activeAgreementByOrderId.set(Number(agreement.serviceOrderId), agreement);
      }
    }

    for (const order of serviceOrders) {
      if (order.economicStatus !== ServiceOrderEconomicStatus.PENDIENTE) {
        throw new BadRequestException(
          `La orden ${order.code} solo puede reconciliarse manualmente si está pendiente de pago`,
        );
      }

      const agreement = activeAgreementByOrderId.get(Number(order.id));
      if (!agreement || Number(agreement.totalAmount || 0) <= 0) {
        throw new BadRequestException(`La orden ${order.code} no tiene acuerdo facturable vigente`);
      }

      const existingLink = await this.linkRepository.findOne({
        where: {
          serviceOrderId: Number(order.id),
          agreementId: Number(agreement.id),
          deletedAt: IsNull(),
        },
      });

      if (existingLink) {
        throw new BadRequestException(`La orden ${order.code} ya está ligada al acuerdo vigente`);
      }
    }

    let remainingAmount = Number(sale.total || 0);
    const createdLinks: ServiceOrderSaleLink[] = [];

    for (const order of serviceOrders) {
      const agreement = activeAgreementByOrderId.get(Number(order.id))!;
      const orderAmount = Number(agreement.totalAmount || 0);
      const linkedAmount = Number(Math.max(0, Math.min(orderAmount, remainingAmount)).toFixed(2));
      remainingAmount = Number(Math.max(0, remainingAmount - linkedAmount).toFixed(2));

      const link = await this.linkRepository.save(
        this.linkRepository.create({
          saleId: sale.id,
          serviceOrderId: Number(order.id),
          agreementId: Number(agreement.id),
          linkedAmount,
          linkedBy: actor ?? null,
          linkedAt: new Date(),
        }),
      );

      await this.syncServiceOrderEconomicState(order.id);
      await this.messageMatrixService.notifyInvoiceLinked(order, sale);
      createdLinks.push(link);
    }

    return this.getLinksByServiceOrderIds(createdLinks.map((link) => Number(link.serviceOrderId)));
  }

  async unlink(id: number) {
    const link = await this.linkRepository.findOne({ where: { id } });
    if (!link || link.deletedAt) {
      throw new NotFoundException('Vínculo no encontrado');
    }

    await this.linkRepository.softDelete(id);
    await this.syncServiceOrderEconomicState(Number(link.serviceOrderId));
    return { ok: true, message: 'Vínculo eliminado' };
  }

  private async syncServiceOrderEconomicState(serviceOrderId: number) {
    const serviceOrder = await this.serviceOrderRepository.findOne({ where: { id: serviceOrderId } });
    if (!serviceOrder) {
      throw new NotFoundException('Orden no encontrada');
    }

    const agreement = await this.agreementRepository.findOne({
      where: {
        serviceOrderId,
        status: ServiceOrderAgreementStatus.CONFIRMED,
      },
      order: { agreedAt: 'DESC', createdAt: 'DESC' },
    });

    if (!agreement || Number(agreement.totalAmount || 0) <= 0) {
      serviceOrder.montoComprometidoVigente = 0;
      serviceOrder.montoReconciliado = 0;
      serviceOrder.economicStatus = ServiceOrderEconomicStatus.NO_APLICA;
      await this.serviceOrderRepository.save(serviceOrder);
      return;
    }

    const links = await this.linkRepository.find({
      where: {
        serviceOrderId,
        deletedAt: IsNull(),
      },
    });

    const linkedAmount = Number(
      links.reduce((sum, link) => sum + Number(link.linkedAmount || 0), 0).toFixed(2),
    );
    const totalAmount = Number(agreement.totalAmount || 0);
    serviceOrder.montoComprometidoVigente = totalAmount;
    serviceOrder.montoReconciliado = linkedAmount;

    if (linkedAmount <= 0) {
      serviceOrder.economicStatus = ServiceOrderEconomicStatus.PENDIENTE;
    } else if (linkedAmount + 0.01 < totalAmount) {
      serviceOrder.economicStatus = ServiceOrderEconomicStatus.PARCIAL;
    } else {
      serviceOrder.economicStatus = ServiceOrderEconomicStatus.TOTAL;
    }

    await this.serviceOrderRepository.save(serviceOrder);
  }
}
