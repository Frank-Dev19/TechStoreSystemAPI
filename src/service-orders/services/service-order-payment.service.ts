import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateServiceOrderPaymentDto } from '../dto/create-service-order-payment.dto';
import { ServiceOrderPaymentStatus } from '../enums';
import { ServiceOrderPayment } from '../entities/service-order-payment.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from '../service-agreements/service-agreement-status.enum';

@Injectable()
export class ServiceOrderPaymentService {
  constructor(
    @InjectRepository(ServiceOrderPayment)
    private readonly paymentRepository: Repository<ServiceOrderPayment>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderAgreement)
    private readonly quoteRepository: Repository<ServiceOrderAgreement>,
  ) {}

  async findAll(serviceOrderId?: number) {
    const where = serviceOrderId ? { serviceOrderId } : {};
    return this.paymentRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async create(serviceOrderId: number, dto: CreateServiceOrderPaymentDto, actorId?: number) {
    const serviceOrder = await this.serviceOrderRepository.findOne({ where: { id: serviceOrderId } });
    if (!serviceOrder) {
      throw new NotFoundException(`ServiceOrder with id ${serviceOrderId} not found`);
    }
    if ([ServiceOrderPaymentStatus.REFUNDED, ServiceOrderPaymentStatus.WAIVED].includes(serviceOrder.paymentStatus)) {
      throw new BadRequestException('Cannot add payments to a refunded or waived order');
    }

    const payment = await this.paymentRepository.save(
      this.paymentRepository.create({
        serviceOrderId,
        amount: dto.amount,
        method: dto.method ?? null,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        createdBy: actorId ?? null,
      }),
    );

    await this.syncPaymentStatus(serviceOrderId);
    return payment;
  }

  private async syncPaymentStatus(serviceOrderId: number): Promise<void> {
    const serviceOrder = await this.serviceOrderRepository.findOne({ where: { id: serviceOrderId } });
    if (!serviceOrder) return;

    const payments = await this.paymentRepository.find({ where: { serviceOrderId } });
    const paidAmount = payments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0);

    const confirmedAgreement = await this.quoteRepository.findOne({
      where: [
        { serviceOrderId, status: ServiceOrderAgreementStatus.CONFIRMED },
      ],
      order: { sequenceNumber: 'DESC' },
    });
    const totalAmount = Number(confirmedAgreement?.totalAmount ?? 0);

    if (paidAmount <= 0) {
      serviceOrder.paymentStatus = ServiceOrderPaymentStatus.UNPAID;
      serviceOrder.isPaid = false;
      serviceOrder.paidAt = null;
    } else if (totalAmount > 0 && paidAmount < totalAmount) {
      serviceOrder.paymentStatus = ServiceOrderPaymentStatus.PARTIALLY_PAID;
      serviceOrder.isPaid = false;
      serviceOrder.paidAt = null;
    } else {
      serviceOrder.paymentStatus = ServiceOrderPaymentStatus.PAID;
      serviceOrder.isPaid = true;
      serviceOrder.paidAt = new Date();
    }

    await this.serviceOrderRepository.save(serviceOrder);
  }
}


