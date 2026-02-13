// src/sales/services/sales.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Sale } from '../entities/sale.entity';
import { SaleItem } from '../entities/sale-item.entity';
import { SalePayment } from '../entities/sale-payment.entity';
import { SaleLineDiscount } from '../entities/sale-line-discount.entity';
import { SaleComboItem } from '../entities/sale-combo-item.entity';
import { BusinessPartner } from 'src/business-partner/entities/business-partner.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Combo } from 'src/pricing/entities/combo.entity';
import { CashRegister } from '../entities/cash-register.entity';
import { CashFlowTransaction } from '../entities/cash-flow-transaction.entity';

import { CreateSaleDto, SaleItemDto, SalePaymentDto } from '../dto/create-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';
import { FilterSalesDto } from '../dto/filter-sales.dto';
import { CancelSaleDto } from '../dto/cancel-sale.dto';
import { SimulateSaleDto } from '../dto/simulate-sale.dto';

import { SalesPricingService } from './sales-pricing.service';
import { SalesInventoryService } from './sales-inventory.service';
import { CashFlowService } from './cash-flow.service';
import { DocumentSeriesService } from './document-series.service';
import { PricingEngineService } from 'src/pricing/services/pricing-engine.service';
import { SaleStatus } from '../enums/sale-status.enum';
import { SaleType } from '../enums/sale-type.enum';
import { DocumentType } from '../enums/document-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface ValidationMessage {
  type: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
    @InjectRepository(SalePayment)
    private readonly salePaymentRepo: Repository<SalePayment>,
    @InjectRepository(SaleLineDiscount)
    private readonly saleLineDiscountRepo: Repository<SaleLineDiscount>,
    @InjectRepository(SaleComboItem)
    private readonly saleComboItemRepo: Repository<SaleComboItem>,
    @InjectRepository(BusinessPartner)
    private readonly bpRepo: Repository<BusinessPartner>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Combo)
    private readonly comboRepo: Repository<Combo>,
    @InjectRepository(CashRegister)
    private readonly cashRegisterRepo: Repository<CashRegister>,
    @InjectRepository(CashFlowTransaction)
    private readonly transactionRepo: Repository<CashFlowTransaction>,

    private readonly salesPricing: SalesPricingService,
    private readonly salesInventory: SalesInventoryService,
    private readonly cashFlowService: CashFlowService,
    private readonly documentSeriesService: DocumentSeriesService,
    private readonly pricingEngine: PricingEngineService,
  ) { }

  // =========================
  // SIMULACIÓN
  // =========================

  async simulate(simulateDto: SimulateSaleDto, userPermissions: string[] = []) {
    const customer = await this.bpRepo.findOne({
      where: { id: simulateDto.customerId, isClient: true },
    });

    if (!customer) {
      throw new BadRequestException('Cliente no encontrado o no es cliente activo');
    }

    // Simular cada producto
    const simulationResults = await Promise.all(
      simulateDto.items.map(async (item) => {
        // Validar stock
        const stockValidation = await this.salesInventory.validateStock({
          productId: item.productId,
          quantity: item.quantity,
        });

        // Obtener precio con descuentos
        const pricing = await this.salesPricing.getProductPricing({
          productId: item.productId,
          quantity: item.quantity,
          priceListCode: simulateDto.priceListCode,
          applyAutoDiscounts: simulateDto.applyAutoDiscounts ?? true,
          userPermissions: [...userPermissions, ...(simulateDto.userPermissions || [])],
        });

        return {
          item,
          stockValidation,
          pricing,
        };
      })
    );

    // Calcular totales CORRECTAMENTE
    const baseSubtotal = simulationResults.reduce(
      (sum, result) => sum + result.pricing.baseSubtotal, 0
    );
    const discountTotal = simulationResults.reduce(
      (sum, result) => sum + result.pricing.totalDiscount, 0
    );
    const subtotal = baseSubtotal - discountTotal;
    const taxRate = 0.18;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    // Verificar consistencia
    const finalSubtotal = simulationResults.reduce(
      (sum, result) => sum + result.pricing.finalSubtotal, 0
    );

    // Validaciones
    const validationMessages: ValidationMessage[] = [];
    for (const result of simulationResults) {
      if (!result.stockValidation.isValid) {
        validationMessages.push({
          type: 'ERROR',
          message: `Stock insuficiente para ${result.pricing.productName}: ${result.stockValidation.warning}`,
        });
      }
    }

    // Verificar consistencia de cálculos
    if (Math.abs(subtotal - finalSubtotal) > 0.01) {
      validationMessages.push({
        type: 'WARNING',
        message: 'Inconsistencia en cálculos de precios (subtotal ≠ finalSubtotal)',
      });
    }

    return {
      customer,
      items: simulationResults.map(result => ({
        productId: result.pricing.productId,
        productName: result.pricing.productName,
        sku: result.pricing.sku,
        quantity: result.item.quantity,
        baseUnitPrice: result.pricing.baseUnitPrice,
        finalUnitPrice: result.pricing.finalUnitPrice,
        baseSubtotal: result.pricing.baseSubtotal,
        finalSubtotal: result.pricing.finalSubtotal,
        totalDiscount: result.pricing.totalDiscount,
        discounts: result.pricing.discounts,
        availableCombos: result.pricing.availableCombos,
        stockValidation: result.stockValidation,
      })),
      summary: {
        baseSubtotal,
        discountTotal,
        subtotal,
        taxRate,
        taxAmount,
        total,
      },
      validation: {
        isValid: validationMessages.length === 0,
        messages: validationMessages,
      },
    };
  }

  // =========================
  // CREAR VENTA
  // =========================
  async create(createSaleDto: CreateSaleDto, user: string) {
    // Validar cliente
    const customer = await this.bpRepo.findOne({
      where: { id: createSaleDto.customerId, isClient: true },
    });

    if (!customer) {
      throw new BadRequestException('Cliente no encontrado o no es cliente activo');
    }

    // Obtener serie y número si no se especifican
    let finalSeries = createSaleDto.series;
    let finalNumber = createSaleDto.number;
    let documentSeriesId: number | null = null;

    if (!finalSeries || !finalNumber) {
      const nextNumber = await this.documentSeriesService.getNextNumber(
        createSaleDto.companyId,
        createSaleDto.documentType
      );
      finalSeries = nextNumber.series;
      finalNumber = nextNumber.number;

      // Obtener el ID de la serie para la relación
      const documentSeries = await this.documentSeriesService.getActiveByType(
        createSaleDto.companyId,
        createSaleDto.documentType
      );
      documentSeriesId = documentSeries?.id || null;
    }

    // Si no se especifica priceListCode, determinarlo automáticamente
    let finalPriceListCode = createSaleDto.priceListCode;
    let enhancedItems = createSaleDto.items;

    if (!finalPriceListCode) {
      // Para cada item, obtener el mejor precio disponible
      enhancedItems = [];

      for (const item of createSaleDto.items) {
        // Llamar al pricing engine para obtener el mejor precio
        const bestPriceResponse = await this.pricingEngine.getBestPriceForQty({
          product_id: item.productId,
          qty: item.quantity,
          user_permissions: [] // Aquí podrían pasarse permisos si fuera necesario
        });

        // Usar el priceListCode del mejor precio encontrado
        const itemPriceListCode = bestPriceResponse.applied.priceListCode;
        finalPriceListCode = itemPriceListCode; // Para esta venta

        enhancedItems.push({
          ...item,
          baseUnitPrice: bestPriceResponse.applied.baseUnitPrice,
          finalUnitPrice: bestPriceResponse.applied.finalUnitPrice
        });
      }
    }

    // Simular para validar (usando enhanced items y priceListCode determinado)
    const simulation = await this.simulate({
      customerId: createSaleDto.customerId,
      saleType: createSaleDto.saleType,
      priceListCode: finalPriceListCode,
      applyAutoDiscounts: createSaleDto.applyAutoDiscounts ?? true,
      items: enhancedItems,
    });

    if (!simulation.validation.isValid) {
      throw new BadRequestException(
        'Validaciones fallidas: ' +
        simulation.validation.messages.map(m => m.message).join('; ')
      );
    }

    // Validar total de pagos vs total de venta
    const totalPayments = createSaleDto.payments.reduce(
      (sum, p) => sum + p.amount, 0
    );

    if (Math.abs(totalPayments - simulation.summary.total) > 0.01) {
      throw new BadRequestException(
        `El total de pagos (${totalPayments}) no coincide con el total de la venta (${simulation.summary.total})`
      );
    }

    // Iniciar transacción
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ✅ Obtener la caja DENTRO de la transacción
      const cashRegister = await queryRunner.manager.findOne(CashRegister, {
        where: {
          companyId: createSaleDto.companyId,
          status: 'OPEN'
        },
      });

      if (!cashRegister) {
        throw new BadRequestException(
          'No hay caja abierta. Debe abrir una caja antes de crear ventas.'
        );
      }

      // Crear venta con valores CORRECTOS
      const sale = this.saleRepo.create({
        companyId: createSaleDto.companyId,
        customerId: createSaleDto.customerId,
        cashRegisterId: cashRegister.id,
        saleType: createSaleDto.saleType as SaleType,
        documentType: createSaleDto.documentType as DocumentType,
        documentSeriesId,
        series: finalSeries,
        number: finalNumber,
        issueDate: createSaleDto.issueDate,
        dueDate: createSaleDto.dueDate,
        priceListCode: finalPriceListCode,
        applyAutoDiscounts: createSaleDto.applyAutoDiscounts ?? true,
        subtotal: simulation.summary.subtotal,           // Subtotal NETO (baseSubtotal - discountTotal)
        discountTotal: simulation.summary.discountTotal, // Total de descuentos
        taxRate: simulation.summary.taxRate,
        taxAmount: simulation.summary.taxAmount,
        total: simulation.summary.total,
        status: 'CONFIRMED' as SaleStatus,
        createdBy: user,
        confirmedBy: user,
        observations: createSaleDto.observations,
      });

      const savedSale = await queryRunner.manager.save(sale);

      // Crear items de venta
      const saleItems: SaleItem[] = [];
      for (let i = 0; i < createSaleDto.items.length; i++) {
        const itemDto = createSaleDto.items[i];
        const simulationResult = simulation.items[i];

        // Validar stock específico (con lote/serial si aplica)
        await this.salesInventory.validateStock({
          productId: itemDto.productId,
          quantity: itemDto.quantity,
          lotId: itemDto.lotId,
          serialIds: itemDto.serialIds,
        });

        // Calcular valores CORRECTOS para el item
        const discountPerUnit = simulationResult.totalDiscount / simulationResult.quantity;
        const taxPerUnit = (simulationResult.finalSubtotal * simulation.summary.taxRate) / simulationResult.quantity;

        const saleItem = this.saleItemRepo.create({
          saleId: savedSale.id,
          productId: itemDto.productId,
          lotId: itemDto.lotId,
          baseUnitPrice: simulationResult.baseUnitPrice,
          finalUnitPrice: simulationResult.finalUnitPrice,
          quantity: itemDto.quantity,
          discountAmount: discountPerUnit,
          taxAmount: taxPerUnit,
          lineTotal: simulationResult.finalSubtotal,
          serialCount: itemDto.serialIds?.length || 0,
          isComboItem: !!itemDto.comboId,
          comboId: itemDto.comboId,
        });

        const savedItem = await queryRunner.manager.save(saleItem);
        saleItems.push(savedItem);

        // Registrar descuentos por línea
        for (const discount of simulationResult.discounts) {
          const lineDiscount = this.saleLineDiscountRepo.create({
            saleId: savedSale.id,
            saleItemId: savedItem.id,
            discountRuleId: discount.ruleId,
            discountSource: discount.source === 'RULE_AUTO' ? 'RULE_AUTO' : 'RULE_MANUAL',
            name: discount.name,
            amount: discount.amount,
            isPercent: discount.type === 'PERCENT',
            discountValue: discount.value * itemDto.quantity,
            priority: discount.priority,
          });

          await queryRunner.manager.save(lineDiscount);
        }

        // Registrar items de combo si aplica
        if (itemDto.comboId) {
          const combo = await this.comboRepo.findOne({
            where: { id: itemDto.comboId },
            relations: ['items', 'items.product'],
          });

          if (combo) {
            for (const comboItem of combo.items) {
              const saleComboItem = this.saleComboItemRepo.create({
                saleId: savedSale.id,
                saleItemId: savedItem.id,
                comboId: combo.id,
                productId: comboItem.productId,
                qtyInCombo: comboItem.qty,
                unitPriceAtSale: simulationResult.finalUnitPrice,
                comboSavings: 0,
              });

              await queryRunner.manager.save(saleComboItem);
            }
          }
        }
      }

      // Crear pagos
      let currentBalance = Number(cashRegister.currentBalance);

      for (const paymentDto of createSaleDto.payments) {
        const payment = this.salePaymentRepo.create({
          saleId: savedSale.id,
          method: paymentDto.method as PaymentMethod,
          amount: paymentDto.amount,
          reference: paymentDto.reference,
          bankName: paymentDto.bankName,
          cardType: paymentDto.cardType,
          paymentDate: paymentDto.paymentDate ? new Date(paymentDto.paymentDate) : new Date(),
        });

        await queryRunner.manager.save(payment);

        // Solo actualizar balance para efectivo
        if (paymentDto.method === 'CASH') {
          currentBalance += Number(paymentDto.amount);
          cashRegister.currentBalance = currentBalance;
          cashRegister.expectedBalance = Number(cashRegister.expectedBalance) + Number(paymentDto.amount);
        }

        // ✅ Crear transacción usando el queryRunner
        const transaction = this.transactionRepo.create({
          cashRegisterId: cashRegister.id,
          saleId: savedSale.id,
          type: 'SALE' as any,
          subtype: paymentDto.method as any,
          description: `Venta ${savedSale.series}-${savedSale.number} (${paymentDto.method})`,
          amount: Number(paymentDto.amount),
          balanceAfter: currentBalance,
          currency: 'PEN',
          exchangeRate: 1,
          reference: `${savedSale.series}-${savedSale.number}`,
          recordedBy: user,
          recordedAt: new Date(),
        });

        await queryRunner.manager.save(transaction);
      }

      // ✅ Guardar cambios en caja DENTRO de la transacción
      await queryRunner.manager.save(cashRegister);

      // Registrar movimientos de inventario
      await this.salesInventory.registerSaleMovement(
        savedSale.id,
        createSaleDto.items,
        user
      );

      // Commit transacción
      await queryRunner.commitTransaction();

      // Retornar venta completa
      return this.findOne(savedSale.id);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // =========================
  // LISTAR VENTAS
  // =========================
  async findAll(filterDto: FilterSalesDto) {
    const {
      companyId,
      customerId,
      status,
      documentType,
      saleType,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 10,
    } = filterDto;

    const query = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.items', 'i')
      .leftJoinAndSelect('i.product', 'p')
      .where('s.companyId = :companyId', { companyId });

    if (customerId) {
      query.andWhere('s.customerId = :customerId', { customerId });
    }

    if (status) {
      query.andWhere('s.status = :status', { status });
    }

    if (documentType) {
      query.andWhere('s.documentType = :documentType', { documentType });
    }

    if (saleType) {
      query.andWhere('s.saleType = :saleType', { saleType });
    }

    if (dateFrom) {
      query.andWhere('s.issueDate >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      query.andWhere('s.issueDate <= :dateTo', { dateTo });
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query.andWhere(
        '(s.series LIKE :search OR s.number LIKE :search OR c.name LIKE :search OR c.documentNumber LIKE :search)',
        { search: searchTerm }
      );
    }

    const [data, total] = await query
      .orderBy('s.issueDate', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =========================
  // OBTENER UNA VENTA
  // =========================
  async findOne(id: number) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: [
        'customer',
        'items',
        'items.product',
        'items.lot',
        'payments',
        'lineDiscounts',
        'comboItems',
        'comboItems.product',
        'comboItems.combo',
      ],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    return sale;
  }

  // =========================
  // ACTUALIZAR VENTA (solo DRAFT)
  // =========================
  async update(id: number, updateSaleDto: UpdateSaleDto, user: string) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: ['items', 'payments'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden modificar ventas en estado DRAFT');
    }

    // Validar que no se intente cambiar datos críticos si ya tiene items
    if (sale.items.length > 0) {
      if (updateSaleDto.documentType && updateSaleDto.documentType !== sale.documentType) {
        throw new BadRequestException('No se puede cambiar el tipo de documento en una venta con items');
      }
    }

    // Actualizar campos
    Object.assign(sale, updateSaleDto);

    // Si se actualizan items, recalcular totales
    if (updateSaleDto.items) {
      // Eliminar items existentes
      await this.saleItemRepo.delete({ saleId: sale.id });

      // Crear nuevos items (simplificado, en realidad deberías simular de nuevo)
      // Por ahora solo guardamos la venta sin recalcular
    }

    sale.updatedAt = new Date();
    return this.saleRepo.save(sale);
  }

  // =========================
  // ANULAR VENTA
  // =========================
  async cancel(id: number, cancelDto: CancelSaleDto, user: string) {
    const sale = await this.saleRepo.findOne({ where: { id } });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (sale.status === 'CANCELLED') {
      return sale;
    }

    if (sale.status !== 'CONFIRMED') {
      throw new BadRequestException('Solo se pueden anular ventas en estado CONFIRMED');
    }

    // TODO: Implementar devolución de stock
    // Por ahora solo cambiamos el estado
    sale.status = SaleStatus.CANCELLED;
    sale.cancelledBy = user;
    sale.cancelledAt = new Date();
    sale.cancelledReason = cancelDto.reason;
    sale.observations = cancelDto.observations
      ? `${sale.observations || ''}\nANULADA: ${cancelDto.observations}`.trim()
      : sale.observations;

    return this.saleRepo.save(sale);
  }

  // =========================
  // OBTENER MÉTRICAS
  // =========================
  async getMetrics(companyId: number, dateFrom?: string, dateTo?: string) {
    const query = this.saleRepo
      .createQueryBuilder('s')
      .select([
        'COUNT(*) as totalSales',
        'SUM(CASE WHEN s.status = "CONFIRMED" THEN 1 ELSE 0 END) as confirmedSales',
        'SUM(CASE WHEN s.status = "CANCELLED" THEN 1 ELSE 0 END) as cancelledSales',
        'SUM(s.total) as totalAmount',
        'SUM(s.discountTotal) as totalDiscounts',
        'SUM(s.taxAmount) as totalTax',
      ])
      .where('s.companyId = :companyId', { companyId });

    if (dateFrom) {
      query.andWhere('s.issueDate >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      query.andWhere('s.issueDate <= :dateTo', { dateTo });
    }

    const result = await query.getRawOne();

    return {
      totalSales: parseInt(result.totalSales) || 0,
      confirmedSales: parseInt(result.confirmedSales) || 0,
      cancelledSales: parseInt(result.cancelledSales) || 0,
      totalAmount: parseFloat(result.totalAmount) || 0,
      totalDiscounts: parseFloat(result.totalDiscounts) || 0,
      totalTax: parseFloat(result.totalTax) || 0,
      averageSale: parseFloat(result.totalAmount) / (parseInt(result.confirmedSales) || 1),
    };
  }

  // =========================
  // OBTENER VENTAS POR PRODUCTO
  // =========================
  async getSalesByProduct(companyId: number, productId?: number, dateFrom?: string, dateTo?: string) {
    const query = this.saleItemRepo
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.sale', 's')
      .leftJoinAndSelect('si.product', 'p')
      .select([
        'p.id as productId',
        'p.name as productName',
        'p.sku as sku',
        'SUM(si.quantity) as totalQuantity',
        'SUM(si.lineTotal) as totalAmount',
        'COUNT(DISTINCT s.id) as saleCount',
      ])
      .where('s.companyId = :companyId', { companyId })
      .andWhere('s.status = "CONFIRMED"')
      .groupBy('p.id, p.name, p.sku');

    if (productId) {
      query.andWhere('si.productId = :productId', { productId });
    }

    if (dateFrom) {
      query.andWhere('s.issueDate >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      query.andWhere('s.issueDate <= :dateTo', { dateTo });
    }

    const results = await query.getRawMany();

    return results.map(row => ({
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      totalQuantity: parseFloat(row.totalQuantity) || 0,
      totalAmount: parseFloat(row.totalAmount) || 0,
      saleCount: parseInt(row.saleCount) || 0,
      averagePrice: parseFloat(row.totalAmount) / (parseFloat(row.totalQuantity) || 1),
    }));
  }
}