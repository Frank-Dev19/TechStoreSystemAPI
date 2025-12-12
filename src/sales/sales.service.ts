// src/sales/sales.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    Repository,
    ILike,
} from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalePayment } from './entities/sale-payment.entity';
import { BusinessPartner } from 'src/business-partner/entities/business-partner.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Lot } from 'src/inventory/entities/lot.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { FilterSalesDto } from './dto/filter-sales.dto';
import { MovementsService } from 'src/inventory/services/movements.service';
import { MovementDto, MovementTypeEnum } from 'src/inventory/dto/movement.dto';

@Injectable()
export class SalesService {
    constructor(
        @InjectRepository(Sale)
        private readonly saleRepo: Repository<Sale>,
        @InjectRepository(SaleItem)
        private readonly saleItemRepo: Repository<SaleItem>,
        @InjectRepository(SalePayment)
        private readonly salePaymentRepo: Repository<SalePayment>,
        @InjectRepository(BusinessPartner)
        private readonly bpRepo: Repository<BusinessPartner>,
        @InjectRepository(Product)
        private readonly prodRepo: Repository<Product>,
        @InjectRepository(Lot)
        private readonly lotRepo: Repository<Lot>,

        private readonly movementsSvc: MovementsService,
    ) { }

    // =========================
    // CREATE
    // =========================
    async create(dto: CreateSaleDto, user: string = 'Usuario Front') {
        const companyId = Number(dto.companyId);
        if (!companyId || Number.isNaN(companyId)) {
            throw new BadRequestException('companyId inválido');
        }

        const customer = await this.bpRepo.findOne({
            where: { id: dto.customerId },
        });
        if (!customer) {
            throw new BadRequestException('Cliente no encontrado');
        }
        if (customer.companyId !== companyId) {
            throw new BadRequestException(
                'El cliente no pertenece a la empresa indicada',
            );
        }

        if (!dto.items || !dto.items.length) {
            throw new BadRequestException('La venta debe tener al menos un ítem');
        }

        const taxRate = dto.taxRate ?? 0.18;
        const exchangeRate = dto.exchangeRate ?? 1;

        // ====================
        // Construir ítems
        // ====================
        let subtotal = 0;
        let totalTax = 0;
        const itemsEntities: SaleItem[] = [];

        for (const itemDto of dto.items) {
            const product = await this.prodRepo.findOne({
                where: { id: itemDto.productId },
            });
            if (!product) {
                throw new BadRequestException(
                    `Producto no encontrado (id=${itemDto.productId})`,
                );
            }

            if (product.managesExpiration && !itemDto.lotId) {
                throw new BadRequestException(
                    `El producto ${product.name} requiere lote (lotId)`,
                );
            }

            if (itemDto.lotId) {
                const lot = await this.lotRepo.findOne({
                    where: { id: itemDto.lotId, productId: product.id },
                });
                if (!lot) {
                    throw new BadRequestException(
                        `Lote inválido para el producto ${product.name}`,
                    );
                }
            }

            const quantity = Number(itemDto.quantity);
            const unitPrice = Number(itemDto.unitPrice);
            const discount = Number(itemDto.discount ?? 0);

            if (quantity <= 0) {
                throw new BadRequestException('La cantidad debe ser mayor que 0');
            }
            if (unitPrice < 0) {
                throw new BadRequestException('El precio unitario no puede ser negativo');
            }
            if (discount < 0) {
                throw new BadRequestException('El descuento no puede ser negativo');
            }

            const lineBase = quantity * unitPrice - discount;
            const lineTax = lineBase * taxRate;
            const lineTotal = lineBase + lineTax;

            subtotal += lineBase;
            totalTax += lineTax;

            const itemEntity = this.saleItemRepo.create({
                productId: product.id,
                lotId: itemDto.lotId ?? null,
                description: itemDto.description ?? product.name,
                quantity,
                unitPrice,
                discount,
                taxAmount: lineTax,
                total: lineTotal,
                serialCount: Array.isArray(itemDto.serialIds)
                    ? itemDto.serialIds.length
                    : 0,
            });

            itemsEntities.push(itemEntity);
        }

        const total = subtotal + totalTax;

        // ====================
        // Construir pagos
        // ====================
        const paymentsEntities: SalePayment[] = [];
        let totalPaid = 0;

        if (dto.payments?.length) {
            for (const pDto of dto.payments) {
                const amount = Number(pDto.amount);
                if (amount < 0) {
                    throw new BadRequestException('El monto de pago no puede ser negativo');
                }
                totalPaid += amount;

                const paymentEntity = this.salePaymentRepo.create({
                    method: pDto.method,
                    amount,
                    paymentDate: pDto.paymentDate
                        ? new Date(pDto.paymentDate)
                        : undefined,
                    reference: pDto.reference ?? null,
                    observations: pDto.observations ?? null,
                });
                paymentsEntities.push(paymentEntity);
            }

            if (totalPaid > total + 0.01) {
                throw new BadRequestException(
                    `La suma de pagos (${totalPaid}) excede el total de la venta (${total})`,
                );
            }
        }

        // ====================
        // Guardar cabecera + detalle
        // ====================
        const sale = this.saleRepo.create({
            companyId,
            customerId: dto.customerId,
            documentType: dto.documentType,
            series: dto.series,
            number: dto.number,
            issueDate: dto.issueDate,
            dueDate: dto.dueDate ?? null,
            currency: dto.currency,
            exchangeRate,
            taxRate,
            subtotal,
            taxAmount: totalTax,
            total,
            observations: dto.observations ?? null,
            status: 'EMITTED', // por ahora siempre emitida al crear
            createdBy: user,
            items: itemsEntities,
            payments: paymentsEntities,
        });

        const saved = await this.saleRepo.save(sale);

        // ====================
        // Movimientos de inventario (SALIDA)
        // ====================
        await this.registerInventoryMovements(saved, dto, user);

        return this.findOne(saved.id);
    }

    private async registerInventoryMovements(
        sale: Sale,
        dto: CreateSaleDto,
        user: string,
    ) {
        const code = `${sale.series}-${sale.number}`;

        for (const itemDto of dto.items) {
            const product = await this.prodRepo.findOne({
                where: { id: itemDto.productId },
            });
            if (!product) {
                throw new BadRequestException(
                    `Producto no encontrado al registrar movimientos (id=${itemDto.productId})`,
                );
            }

            const movement: MovementDto = {
                type: MovementTypeEnum.OUT,
                product_id: itemDto.productId,
                qty: Number(itemDto.quantity),
                lot_id: itemDto.lotId ?? undefined,
                reason_code: 'SALE',
                notes: `Venta ${code}`,
                source_doc_type: 'SALE',
                source_doc_id: String(sale.id),
                user_created: user,
            };

            if (product.isSerialized) {
                movement.serial_ids = itemDto.serialIds ?? [];
            }

            await this.movementsSvc.createMovement(movement, user);
        }
    }

    // =========================
    // FIND ALL (listado)
    // =========================
    async findAll(q: FilterSalesDto) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 10));
        const companyId = Number(q.companyId);

        if (!companyId || Number.isNaN(companyId) || companyId <= 0) {
            throw new BadRequestException('companyId válido es obligatorio');
        }

        const qb = this.saleRepo
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.customer', 'c')
            .where('s.companyId = :companyId', { companyId });

        if (q.status) {
            qb.andWhere('s.status = :status', { status: q.status });
        }

        if (q.customerId) {
            qb.andWhere('s.customerId = :custId', { custId: q.customerId });
        }

        if (q.dateFrom) {
            qb.andWhere('s.issueDate >= :df', { df: q.dateFrom });
        }

        if (q.dateTo) {
            qb.andWhere('s.issueDate <= :dt', { dt: q.dateTo });
        }

        if (q.search?.trim()) {
            const search = `%${q.search.trim()}%`;
            qb.andWhere(
                '(s.series LIKE :search OR s.number LIKE :search OR c.name LIKE :search OR c.documentNumber LIKE :search)',
                { search },
            );
        }

        qb.orderBy('s.issueDate', 'DESC')
            .addOrderBy('s.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [data, total] = await qb.getManyAndCount();

        return {
            data,
            total,
            page,
            limit,
        };
    }

    // =========================
    // FIND ONE
    // =========================
    async findOne(id: number) {
        const sale = await this.saleRepo.findOne({
            where: { id },
            relations: ['items', 'items.product', 'items.lot', 'payments', 'customer'],
        });
        if (!sale) {
            throw new NotFoundException(`Venta con id ${id} no encontrada`);
        }
        return sale;
    }

    // =========================
    // UPDATE (solo DRAFT)
    // =========================
    async update(id: number, dto: UpdateSaleDto) {
        const sale = await this.saleRepo.findOne({
            where: { id },
            relations: ['items', 'payments'],
        });
        if (!sale) {
            throw new NotFoundException(`Venta con id ${id} no encontrada`);
        }

        if (sale.status !== 'DRAFT') {
            throw new BadRequestException(
                'Solo se pueden modificar ventas en estado DRAFT',
            );
        }

        // Nota: aquí podrías reutilizar parte de la lógica de create
        // (recalcular ítems, totales, etc.). Para no hacerlo larguísimo,
        // por ahora dejamos un TODO.
        throw new BadRequestException(
            'Update de ventas DRAFT pendiente de implementar (TODO)',
        );
    }

    // =========================
    // CANCEL
    // =========================
    async cancel(id: number, reason: string | null, user: string) {
        const sale = await this.saleRepo.findOne({ where: { id } });
        if (!sale) {
            throw new NotFoundException(`Venta con id ${id} no encontrada`);
        }

        if (sale.status === 'CANCELLED') {
            return sale;
        }

        if (sale.status !== 'EMITTED') {
            throw new BadRequestException(
                'Solo se pueden anular ventas en estado EMITTED',
            );
        }

        sale.status = 'CANCELLED';
        sale.cancelledReason = reason || null;
        sale.cancelledBy = user;
        sale.cancelledAt = new Date();

        // ⚠️ Importante:
        // Aquí NO revertimos stock automáticamente.
        // Podrás luego definir la política (nota de crédito, ajuste ADJ+, etc.).
        return this.saleRepo.save(sale);
    }
}
