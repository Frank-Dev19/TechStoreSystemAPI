// src/sales/services/sales.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull } from 'typeorm';
import { Sale } from '../entities/sale.entity';
import { SaleItem } from '../entities/sale-item.entity';
import { SalePayment } from '../entities/sale-payment.entity';
import { SaleLineDiscount } from '../entities/sale-line-discount.entity';
import { SaleComboItem } from '../entities/sale-combo-item.entity';
import { Client } from 'src/clients/entities/client.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Lot } from 'src/inventory/entities/lot.entity';
import { Serial } from 'src/inventory/entities/serial.entity';
import { Stock } from 'src/inventory/entities/stock.entity';
import { Movement } from 'src/inventory/entities/movement.entity';
import { MovementSerial } from 'src/inventory/entities/movement-serial.entity';
import { CashRegister } from '../entities/cash-register.entity';
import { CashFlowTransaction } from '../entities/cash-flow-transaction.entity';

import { CreateSaleDto, SaleItemDto, SalePaymentDto, SaleItemKindDto } from '../dto/create-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';
import { FilterSalesDto } from '../dto/filter-sales.dto';
import { CancelSaleDto } from '../dto/cancel-sale.dto';
import { SimulateSaleDto } from '../dto/simulate-sale.dto';
import { CreateSaleFromServiceAgreementsDto } from '../dto/create-sale-from-service-agreements.dto';

import { SalesPricingService } from './sales-pricing.service';
import { SalesInventoryService } from './sales-inventory.service';
import { CashFlowService } from './cash-flow.service';
import { DocumentSeriesService } from './document-series.service';
import { PricingEngineService } from 'src/pricing/services/pricing-engine.service';
import { TaxConfigService } from 'src/pricing/services/tax-config.service';
import { ServiceOrder } from 'src/service-orders/entities/service-order.entity';
import { ServiceOrderSaleLink } from 'src/service-orders/entities/service-order-sale-link.entity';
import { ServiceOrderEconomicStatus } from 'src/service-orders/enums';
import { ServiceOrderAgreement } from 'src/service-orders/service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementStatus } from 'src/service-orders/service-agreements/service-agreement-status.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { SaleType } from '../enums/sale-type.enum';
import { DocumentType } from '../enums/document-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { ClientKind } from 'src/clients/entities/client-kind.enum';

export interface ValidationMessage {
  type: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}

type ServiceOrderSaleDraftItem = {
  itemType: SaleItemKindDto.PRODUCT;
  productId: number | null;
  quantity: number;
  baseUnitPrice: number;
  finalUnitPrice: number;
  description: string;
};

type ServiceOrderSaleDraftServiceItem = {
  itemType: SaleItemKindDto.SERVICE;
  quantity: number;
  baseUnitPrice: number;
  finalUnitPrice: number;
  description: string;
  serviceCodeSnapshot: string;
  serviceNameSnapshot: string;
};

type ServiceOrderSaleDraftLine = ServiceOrderSaleDraftItem | ServiceOrderSaleDraftServiceItem;

function isServiceOrderSaleDraftServiceItem(
  item: ServiceOrderSaleDraftLine,
): item is ServiceOrderSaleDraftServiceItem {
  return item.itemType === SaleItemKindDto.SERVICE;
}

function isServiceOrderSaleDraftProductItem(
  item: ServiceOrderSaleDraftLine,
): item is ServiceOrderSaleDraftItem {
  return item.itemType === SaleItemKindDto.PRODUCT;
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
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Lot)
    private readonly lotRepo: Repository<Lot>,
    @InjectRepository(Serial)
    private readonly serialRepo: Repository<Serial>,
    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,
    @InjectRepository(CashRegister)
    private readonly cashRegisterRepo: Repository<CashRegister>,
    @InjectRepository(CashFlowTransaction)
    private readonly transactionRepo: Repository<CashFlowTransaction>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(MovementSerial)
    private readonly movementSerialRepo: Repository<MovementSerial>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepo: Repository<ServiceOrder>,
    @InjectRepository(ServiceOrderAgreement)
    private readonly agreementRepo: Repository<ServiceOrderAgreement>,
    @InjectRepository(ServiceOrderSaleLink)
    private readonly serviceOrderSaleLinkRepo: Repository<ServiceOrderSaleLink>,

    private readonly salesPricing: SalesPricingService,
    private readonly salesInventory: SalesInventoryService,
    private readonly cashFlowService: CashFlowService,
    private readonly documentSeriesService: DocumentSeriesService,
    private readonly pricingEngine: PricingEngineService,
    private readonly taxConfigService: TaxConfigService,
  ) { }

  // =========================
  // SIMULACIÓN
  // =========================

  async simulate(simulateDto: SimulateSaleDto, userPermissions: string[] = []) {
    const customer = await this.clientRepo.findOne({
      where: { id: simulateDto.customerId },
    });

    if (!customer) {
      throw new BadRequestException('Cliente no encontrado');
    }

    // Simular cada línea de venta
    const simulationResults = await Promise.all(
      simulateDto.items.map(async (item) => {
        if (item.itemType === SaleItemKindDto.SERVICE) {
          const unitPrice = Number(item.finalUnitPrice ?? item.baseUnitPrice ?? 0);
          const finalSubtotal = Number((unitPrice * Number(item.quantity)).toFixed(2));
          const serviceLabel = (item as any).serviceNameSnapshot ?? item.description ?? 'Servicio técnico';
          const serviceCode = (item as any).serviceCodeSnapshot ?? 'TECHNICAL_SERVICE';

          return {
            item,
            stockValidation: {
              isValid: true,
              warning: null,
            },
            pricing: {
              itemType: SaleItemKindDto.SERVICE,
              productId: null,
              serviceId: null,
              productName: serviceLabel,
              sku: serviceCode,
              baseUnitPrice: unitPrice,
              finalUnitPrice: unitPrice,
              baseSubtotal: finalSubtotal,
              totalDiscount: 0,
              finalSubtotal,
              discounts: [],
              availableCombos: [],
            },
          };
        }

        if (!item.productId) {
          throw new BadRequestException('Cada línea de producto requiere productId');
        }

        const stockValidation = await this.salesInventory.validateStock({
          productId: item.productId,
          quantity: item.quantity,
        });

        const pricing = await this.salesPricing.getProductPricing({
          productId: item.productId,
          quantity: item.quantity,
          discountPct: item.discountPct ?? 0,
        });

        return {
          item,
          stockValidation,
          pricing: {
            ...pricing,
            itemType: SaleItemKindDto.PRODUCT,
            serviceId: null,
          },
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

    // ❌ ANTES: Se calculaba IGV adicional (precio ya incluye IGV)
    // const taxRate = 0.18;
    // const taxAmount = subtotal * taxRate;
    // const total = subtotal + taxAmount;

    // ✅ AHORA: El precio YA incluye IGV, no se calcula adicional
    const taxRate = 0; // Sin cálculo de IGV adicional
    const taxAmount = 0; // Sin cálculo de IGV adicional
    const total = subtotal; // El total es el precio con IGV incluido

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
        itemType: result.pricing.itemType,
        productId: result.pricing.productId,
        serviceId: result.pricing.serviceId,
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
  // FUNCIÓN AUXILIAR: Obtener lote y seriales automáticamente
  // =========================
  // Ahora retorna un array de lotes para manejar ventas de múltiples lotes
  private async getAutoLotAndSerials(productId: number, quantity: number, existingLotId?: number | null, existingSerialIds?: number[]) {
    const product = await this.productRepo.findOne({ where: { id: productId } });

    if (!product) {
      throw new BadRequestException(`Producto con ID ${productId} no encontrado`);
    }

    // Si ya se especificó lote y seriales específicos, usarlos
    if (existingLotId && existingSerialIds && existingSerialIds.length > 0) {
      return [{
        lotId: existingLotId,
        quantityFromThisLot: quantity,
        serialIds: existingSerialIds
      }];
    }

    const result: Array<{
      lotId: number | null;
      quantityFromThisLot: number;
      serialIds: number[];
    }> = [];

    // Si el producto maneja vencimiento y no se envió lote específico
    if (product.managesExpiration && !existingLotId) {
      // Obtener todos los lotes con stock disponible, ordenados por fecha de vencimiento (FEFO)
      const stockWithLots = await this.stockRepo
        .createQueryBuilder('stock')
        .innerJoin('stock.lot', 'lot')
        .where('stock.productId = :productId', { productId })
        .andWhere('stock.qtyOnHand > 0')
        .orderBy('lot.expirationDate', 'ASC')
        .addOrderBy('stock.id', 'ASC')
        .getMany();

      if (stockWithLots.length === 0) {
        throw new BadRequestException(`No hay stock disponible para el producto con ID ${productId}`);
      }

      // Distribuir la cantidad entre múltiples lotes
      let remainingQty = quantity;

      for (const stock of stockWithLots) {
        if (remainingQty <= 0) break;

        const availableQty = Number(stock.qtyOnHand);
        const qtyToTake = Math.min(availableQty, remainingQty);

        // Obtener seriales de este lote específico si es producto serializado
        let serialIds: number[] = [];

        if (product.isSerialized) {
          // Primero buscar seriales del lote actual
          let serialsInThisLot = await this.serialRepo.find({
            where: {
              productId,
              lotId: stock.lotId!,
              status: 'IN_STOCK',
            },
            order: { id: 'ASC' },
            take: qtyToTake,
          });

          // Si no hay suficientes en este lote, buscar en otros lotes
          if (serialsInThisLot.length < qtyToTake) {
            let remainingSerialsNeeded = qtyToTake - serialsInThisLot.length;

            // Buscar en otros lotes con stock
            const otherLots = stockWithLots.filter(s => s.lotId !== stock.lotId && Number(s.qtyOnHand) > 0);

            for (const otherStock of otherLots) {
              if (remainingSerialsNeeded <= 0) break;

              const serialsInOtherLot = await this.serialRepo.find({
                where: {
                  productId,
                  lotId: otherStock.lotId!,
                  status: 'IN_STOCK',
                },
                order: { id: 'ASC' },
                take: remainingSerialsNeeded,
              });

              serialsInThisLot.push(...serialsInOtherLot);
              remainingSerialsNeeded -= serialsInOtherLot.length;
            }
          }

          // Si aún no hay suficientes, buscar seriales sin lote
          if (serialsInThisLot.length < qtyToTake) {
            const remainingSerialsNeeded = qtyToTake - serialsInThisLot.length;

            const serialsWithoutLot = await this.serialRepo.find({
              where: {
                productId,
                lotId: IsNull(),
                status: 'IN_STOCK',
              },
              order: { id: 'ASC' },
              take: remainingSerialsNeeded,
            });

            serialsInThisLot.push(...serialsWithoutLot);
          }

          if (serialsInThisLot.length < qtyToTake) {
            throw new BadRequestException(
              `Stock insuficiente de seriales para producto ${product.name}. Disponibles: ${serialsInThisLot.length}, necesarios: ${qtyToTake}`
            );
          }

          serialIds = serialsInThisLot.slice(0, qtyToTake).map(s => s.id);
        }

        result.push({
          lotId: stock.lotId!,
          quantityFromThisLot: qtyToTake,
          serialIds
        });

        remainingQty -= qtyToTake;
      }

      if (remainingQty > 0) {
        throw new BadRequestException(
          `Stock total insuficiente. Disponible: ${quantity - remainingQty}, solicitado: ${quantity}`
        );
      }

      return result;
    }

    // Si no maneja vencimiento pero es serializado (solo seriales, sin lote)
    if (product.isSerialized && !product.managesExpiration) {
      const availableSerials = await this.serialRepo.find({
        where: {
          productId,
          status: 'IN_STOCK',
        },
        order: { id: 'ASC' },
        take: quantity,
      });

      if (availableSerials.length < quantity) {
        throw new BadRequestException(
          `Stock insuficiente de seriales para producto ${product.name}. Disponibles: ${availableSerials.length}, solicitados: ${quantity}`
        );
      }

      // Agrupar seriales por lote
      const serialsByLot = new Map<number | null, number[]>();

      for (const serial of availableSerials) {
        const lotKey = serial.lotId ?? null;
        if (!serialsByLot.has(lotKey)) {
          serialsByLot.set(lotKey, []);
        }
        serialsByLot.get(lotKey)!.push(serial.id);
      }

      // Crear entrada por cada lote
      for (const [lotId, serialIds] of serialsByLot) {
        result.push({
          lotId: lotId,
          quantityFromThisLot: serialIds.length,
          serialIds
        });
      }

      return result;
    }

    // Producto simple sin lote ni seriales
    return [{
      lotId: null,
      quantityFromThisLot: quantity,
      serialIds: []
    }];
  }

  // =========================
  // CREAR VENTA
  // =========================
  async create(createSaleDto: CreateSaleDto, user: string) {
    const allowServiceItems = Boolean((createSaleDto as any).allowServiceItems);
    // Validar cliente
    const customer = await this.clientRepo.findOne({
      where: { id: createSaleDto.customerId },
    });

    if (!customer) {
      throw new BadRequestException('Cliente no encontrado');
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

    // Calcular precios usando el nuevo motor de porcentajes
    const enhancedItems: any[] = [];

    for (const item of createSaleDto.items) {
      if (item.itemType === SaleItemKindDto.SERVICE) {
        if (!allowServiceItems) {
          throw new BadRequestException('Las ventas manuales solo admiten productos');
        }
        const servicePrice = Number(item.finalUnitPrice ?? item.baseUnitPrice ?? 0);
        enhancedItems.push({
          ...item,
          baseUnitPrice: servicePrice,
          finalUnitPrice: servicePrice
        });
        continue;
      }

      if (!item.productId) {
        throw new BadRequestException('Cada línea de producto requiere productId');
      }

      // Calcular precio con el motor de porcentajes
      const priceCalc = await this.pricingEngine.calculatePrice(item.productId);
      const discountPct = item.discountPct ?? 0;
      const finalUnitPrice = Number((priceCalc.salePrice * (1 - discountPct / 100)).toFixed(6));

      enhancedItems.push({
        ...item,
        baseUnitPrice: priceCalc.salePrice,
        finalUnitPrice,
      });
    }

    // Simular para validar
    const simulation = await this.simulate({
      customerId: createSaleDto.customerId,
      saleType: createSaleDto.saleType,
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
        priceListCode: '',
        applyAutoDiscounts: true,
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

      // Array para guardar lotId y serialIds automáticos para el movimiento de inventario
      // Ahora es un array de arrays porque puede haber múltiples lotes por producto
      const itemsWithAutoData: Array<{
        productId: number;
        quantity: number;
        lotId: number | null;
        serialIds: number[];
      }> = [];

      for (let i = 0; i < createSaleDto.items.length; i++) {
        const itemDto = createSaleDto.items[i];
        const simulationResult = simulation.items[i];
        if (itemDto.itemType === SaleItemKindDto.SERVICE) {
          if (!allowServiceItems) {
            throw new BadRequestException('Las ventas manuales solo admiten productos');
          }

          const saleItem = this.saleItemRepo.create({
            saleId: savedSale.id,
            itemType: 'SERVICE',
            productId: null,
            serviceId: null,
            serviceCodeSnapshot: (itemDto as any).serviceCodeSnapshot ?? 'TECHNICAL_SERVICE',
            serviceNameSnapshot: (itemDto as any).serviceNameSnapshot ?? itemDto.description ?? 'Servicio técnico',
            descriptionSnapshot: itemDto.description ?? (itemDto as any).serviceNameSnapshot ?? 'Servicio técnico',
            lotId: null,
            baseUnitPrice: simulationResult.baseUnitPrice,
            finalUnitPrice: simulationResult.finalUnitPrice,
            quantity: itemDto.quantity,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: simulationResult.finalSubtotal,
            serialCount: 0,
            isComboItem: false,
            comboId: null,
          });

          const savedItem = await queryRunner.manager.save(saleItem);
          saleItems.push(savedItem);
          continue;
        }

        if (!itemDto.productId) {
          throw new BadRequestException('Cada línea de producto requiere productId');
        }

        // ✅ OBTENER LOTE Y SERIALES AUTOMÁTICAMENTE si no se enviaron
        // Ahora retorna un array de lotes
        const lotsData = await this.getAutoLotAndSerials(
          itemDto.productId,
          itemDto.quantity,
          itemDto.lotId,
          itemDto.serialIds
        );

        // Guardar para usar en el movimiento de inventario (cada lote es un movimiento separado)
        for (const lotData of lotsData) {
          itemsWithAutoData.push({
            productId: itemDto.productId,
            quantity: lotData.quantityFromThisLot,
            lotId: lotData.lotId,
            serialIds: lotData.serialIds
          });
        }

        // Usar el primer lote para el item de venta (para compatibilidad)
        const firstLotData = lotsData[0];

        // Recopilar TODOS los seriales de TODOS los lotes para la validación
        const allSerialIds: number[] = [];
        for (const lotData of lotsData) {
          allSerialIds.push(...lotData.serialIds);
        }

        // Validar stock específico (con lote/serial si aplica)
        // Ahora pasamos todos los seriales de todos los lotes
        await this.salesInventory.validateStock({
          productId: itemDto.productId,
          quantity: itemDto.quantity,
          lotId: firstLotData.lotId,
          serialIds: allSerialIds,
        });

        // Calcular valores CORRECTOS para el item
        const discountPerUnit = simulationResult.totalDiscount / simulationResult.quantity;
        const taxPerUnit = (simulationResult.finalSubtotal * simulation.summary.taxRate) / simulationResult.quantity;

        const saleItem = this.saleItemRepo.create({
          saleId: savedSale.id,
          itemType: 'PRODUCT',
          productId: itemDto.productId,
          serviceId: null,
          serviceCodeSnapshot: null,
          serviceNameSnapshot: null,
          descriptionSnapshot: simulationResult.productName,
          lotId: firstLotData.lotId,
          baseUnitPrice: simulationResult.baseUnitPrice,
          finalUnitPrice: simulationResult.finalUnitPrice,
          quantity: itemDto.quantity,
          discountAmount: discountPerUnit,
          taxAmount: taxPerUnit,
          lineTotal: simulationResult.finalSubtotal,
          serialCount: firstLotData.serialIds?.length || 0,
          isComboItem: !!itemDto.comboId,
          comboId: itemDto.comboId,
        });

        const savedItem = await queryRunner.manager.save(saleItem);
        saleItems.push(savedItem);

        // Registrar descuentos por línea (rebaja del vendedor)
        for (const discount of simulationResult.discounts) {
          const lineDiscount = this.saleLineDiscountRepo.create({
            saleId: savedSale.id,
            saleItemId: savedItem.id,
            discountRuleId: null,
            discountSource: 'SELLER_DISCOUNT',
            name: discount.name,
            amount: discount.amount,
            isPercent: discount.type === 'PERCENT',
            discountValue: discount.value * itemDto.quantity,
            priority: discount.priority,
          });

          await queryRunner.manager.save(lineDiscount);
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

        // Actualizar balance según método de pago
        const paymentAmount = Number(paymentDto.amount);

        switch (paymentDto.method) {
          case 'CASH':
            currentBalance += paymentAmount;
            cashRegister.currentBalance = currentBalance;
            cashRegister.expectedBalance = Number(cashRegister.expectedBalance) + paymentAmount;
            cashRegister.totalCash = Number(cashRegister.totalCash || 0) + paymentAmount;
            break;
          case 'CARD':
            cashRegister.totalCard = Number(cashRegister.totalCard || 0) + paymentAmount;
            break;
          case 'TRANSFER':
            cashRegister.totalTransfer = Number(cashRegister.totalTransfer || 0) + paymentAmount;
            break;
          case 'YAPE':
            cashRegister.totalYape = Number(cashRegister.totalYape || 0) + paymentAmount;
            break;
          case 'PLIN':
            cashRegister.totalPlin = Number(cashRegister.totalPlin || 0) + paymentAmount;
            break;
          case 'CREDIT':
            // Crédito no afecta el balance de la caja directamente
            break;
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

      // Registrar movimientos de inventario con lot y seriales automáticos
      await this.salesInventory.registerSaleMovement(
        savedSale.id,
        itemsWithAutoData,
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

  async createFromServiceOrder(dto: any, user: string) {
    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { id: Number(dto.serviceOrderId) } });
    if (!serviceOrder) {
      throw new NotFoundException('Orden de servicio no encontrada');
    }
    if (serviceOrder.economicStatus !== ServiceOrderEconomicStatus.PENDIENTE) {
      throw new BadRequestException('Solo se puede facturar desde órdenes pendientes de pago');
    }

    const confirmedAgreements = await this.agreementRepo.find({
      where: {
        serviceOrderId: Number(dto.serviceOrderId),
        status: ServiceOrderAgreementStatus.CONFIRMED,
      },
      relations: ['productItems', 'serviceItems'],
      order: { agreedAt: 'DESC', createdAt: 'DESC' },
    });
    const agreement = confirmedAgreements[0];
    if (!agreement) {
      throw new BadRequestException('La orden no tiene acuerdo confirmado para facturar');
    }

    const totalAmount = Number(agreement.totalAmount ?? 0);
    const totalPayments = (dto.payments ?? []).reduce(
      (sum: number, payment: { amount?: number }) => sum + Number(payment.amount ?? 0),
      0,
    );
    if (Math.abs(totalPayments - totalAmount) > 0.01) {
      throw new BadRequestException(
        `El total de pagos (${totalPayments}) no coincide con el total del acuerdo (${totalAmount})`,
      );
    }

    const items: ServiceOrderSaleDraftLine[] = [
      ...(agreement.productItems ?? []).map((item) => ({
        itemType: SaleItemKindDto.PRODUCT as const,
        productId: item.productId,
        quantity: Number(item.quantity ?? 0),
        baseUnitPrice: Number(item.unitPrice ?? 0),
        finalUnitPrice: Number(item.unitPrice ?? 0),
        description: item.productNameSnapshot,
      })),
      ...(agreement.serviceItems ?? []).map((item) => ({
        itemType: SaleItemKindDto.SERVICE as const,
        quantity: 1,
        baseUnitPrice: Number(item.unitPrice ?? 0),
        finalUnitPrice: Number(item.unitPrice ?? 0),
        description: item.serviceNameSnapshot,
        serviceCodeSnapshot: item.serviceCodeSnapshot,
        serviceNameSnapshot: item.serviceNameSnapshot,
      })),
    ];

    let finalSeries = dto.series;
    let finalNumber = dto.number;
    let documentSeriesId: number | null = null;

    if (!finalSeries || !finalNumber) {
      const nextNumber = await this.documentSeriesService.getNextNumber(dto.companyId, dto.documentType);
      finalSeries = nextNumber.series;
      finalNumber = nextNumber.number;
      const documentSeries = await this.documentSeriesService.getActiveByType(dto.companyId, dto.documentType);
      documentSeriesId = documentSeries?.id || null;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingLink = await queryRunner.manager.findOne(ServiceOrderSaleLink, {
        where: {
          serviceOrderId: Number(serviceOrder.id),
          agreementId: Number(agreement.id),
          deletedAt: IsNull(),
        } as any,
      });
      if (existingLink) {
        throw new BadRequestException('La orden ya tiene un comprobante autoligado para el acuerdo vigente');
      }

      const cashRegister = await queryRunner.manager.findOne(CashRegister, {
        where: { companyId: dto.companyId, status: 'OPEN' },
      });
      if (!cashRegister) {
        throw new BadRequestException('No hay caja abierta. Debe abrir una caja antes de crear ventas.');
      }

      const sale = await queryRunner.manager.save(
        this.saleRepo.create({
          companyId: dto.companyId,
          customerId: Number(serviceOrder.clientId),
          cashRegisterId: cashRegister.id,
          saleType: dto.saleType ?? SaleType.SERVICE,
          documentType: dto.documentType as DocumentType,
          documentSeriesId,
          series: finalSeries,
          number: finalNumber,
          issueDate: dto.issueDate,
          dueDate: dto.dueDate ?? dto.issueDate,
          priceListCode: '',
          applyAutoDiscounts: false,
          subtotal: totalAmount,
          discountTotal: 0,
          taxRate: 0,
          taxAmount: 0,
          total: totalAmount,
          status: 'CONFIRMED' as SaleStatus,
          createdBy: user,
          confirmedBy: user,
          observations: dto.observations,
        }),
      );

      const itemsWithAutoData: Array<{ productId: number; quantity: number; lotId: number | null; serialIds: number[] }> = [];

      for (const item of items) {
        if (isServiceOrderSaleDraftServiceItem(item)) {
          await queryRunner.manager.save(
            this.saleItemRepo.create({
              saleId: sale.id,
              itemType: 'SERVICE',
              productId: null,
              serviceId: null,
              serviceCodeSnapshot: item.serviceCodeSnapshot ?? 'TECHNICAL_SERVICE',
              serviceNameSnapshot: item.serviceNameSnapshot ?? 'Servicio técnico',
              descriptionSnapshot: item.description ?? item.serviceNameSnapshot ?? 'Servicio técnico',
              lotId: null,
              baseUnitPrice: item.baseUnitPrice,
              finalUnitPrice: item.finalUnitPrice,
              quantity: item.quantity,
              discountAmount: 0,
              taxAmount: 0,
              lineTotal: Number((Number(item.quantity ?? 1) * Number(item.finalUnitPrice ?? 0)).toFixed(2)),
              serialCount: 0,
              isComboItem: false,
              comboId: null,
            }),
          );
          continue;
        }

        if (!isServiceOrderSaleDraftProductItem(item) || !item.productId) {
          throw new BadRequestException('Cada línea de producto requiere productId');
        }

        const lotsData = await this.getAutoLotAndSerials(item.productId, item.quantity);
        for (const lotData of lotsData) {
          itemsWithAutoData.push({
            productId: item.productId,
            quantity: lotData.quantityFromThisLot,
            lotId: lotData.lotId,
            serialIds: lotData.serialIds,
          });
        }

        const firstLotData = lotsData[0];
        await queryRunner.manager.save(
          this.saleItemRepo.create({
            saleId: sale.id,
            itemType: 'PRODUCT',
            productId: item.productId,
            serviceId: null,
            serviceCodeSnapshot: null,
            serviceNameSnapshot: null,
            descriptionSnapshot: item.description,
            lotId: firstLotData?.lotId ?? null,
            baseUnitPrice: item.baseUnitPrice,
            finalUnitPrice: item.finalUnitPrice,
            quantity: item.quantity,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: Number((Number(item.quantity ?? 1) * Number(item.finalUnitPrice ?? 0)).toFixed(2)),
            serialCount: firstLotData?.serialIds?.length || 0,
            isComboItem: false,
            comboId: null,
          }),
        );
      }

      let currentBalance = Number(cashRegister.currentBalance ?? 0);
      for (const paymentDto of dto.payments ?? []) {
        await queryRunner.manager.save(
          this.salePaymentRepo.create({
            saleId: sale.id,
            method: paymentDto.method as PaymentMethod,
            amount: paymentDto.amount,
            reference: paymentDto.reference,
            bankName: paymentDto.bankName,
            cardType: paymentDto.cardType,
            paymentDate: paymentDto.paymentDate ? new Date(paymentDto.paymentDate) : new Date(),
          }),
        );

        const paymentAmount = Number(paymentDto.amount ?? 0);
        switch (paymentDto.method) {
          case 'CASH':
            currentBalance += paymentAmount;
            cashRegister.currentBalance = currentBalance;
            cashRegister.expectedBalance = Number(cashRegister.expectedBalance ?? 0) + paymentAmount;
            cashRegister.totalCash = Number(cashRegister.totalCash ?? 0) + paymentAmount;
            break;
          case 'CARD':
            cashRegister.totalCard = Number(cashRegister.totalCard ?? 0) + paymentAmount;
            break;
          case 'TRANSFER':
            cashRegister.totalTransfer = Number(cashRegister.totalTransfer ?? 0) + paymentAmount;
            break;
          case 'YAPE':
            cashRegister.totalYape = Number(cashRegister.totalYape ?? 0) + paymentAmount;
            break;
          case 'PLIN':
            cashRegister.totalPlin = Number(cashRegister.totalPlin ?? 0) + paymentAmount;
            break;
          case 'CREDIT':
            break;
        }

        await queryRunner.manager.save(
          this.transactionRepo.create({
            cashRegisterId: cashRegister.id,
            saleId: sale.id,
            type: 'SALE_PAYMENT',
            subtype: paymentDto.method as any,
            amount: paymentAmount,
            balanceAfter: currentBalance,
            description: `Venta desde orden ${serviceOrder.code}`,
            reference: `${finalSeries}-${finalNumber}`,
            recordedBy: user,
            recordedAt: new Date(),
          } as any),
        );
      }

      await queryRunner.manager.save(cashRegister);
      await queryRunner.manager.save(
        this.serviceOrderSaleLinkRepo.create({
          saleId: Number(sale.id),
          serviceOrderId: Number(serviceOrder.id),
          agreementId: Number(agreement.id),
          linkedAmount: totalAmount,
          linkedBy: user,
          linkedAt: new Date(),
        }),
      );
      await queryRunner.manager.save(
        ServiceOrder,
        this.serviceOrderRepo.create({
          ...serviceOrder,
          montoComprometidoVigente: totalAmount,
          montoReconciliado: totalAmount,
          economicStatus: ServiceOrderEconomicStatus.TOTAL,
        }),
      );

      if (itemsWithAutoData.length) {
        await this.salesInventory.registerSaleMovement(sale.id, itemsWithAutoData, user);
      }

      await queryRunner.commitTransaction();
      return this.findOne(sale.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createFromServiceAgreements(dto: CreateSaleFromServiceAgreementsDto, user: string) {
    const uniqueServiceOrderIds = Array.from(
      new Set((dto.serviceOrderIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
    );
    if (!uniqueServiceOrderIds.length) {
      throw new BadRequestException('Debe seleccionar al menos una orden para facturar');
    }

    const serviceOrders = await this.serviceOrderRepo.find({
      where: { id: In(uniqueServiceOrderIds) },
      relations: ['client'],
    });
    if (serviceOrders.length !== uniqueServiceOrderIds.length) {
      throw new NotFoundException('Una o más órdenes no existen');
    }

    const distinctClientIds = new Set(serviceOrders.map((order) => Number(order.clientId || 0)));
    if (distinctClientIds.size > 1) {
      throw new BadRequestException('Solo se pueden agrupar órdenes del mismo cliente operativo');
    }

    for (const order of serviceOrders) {
      if (order.economicStatus !== ServiceOrderEconomicStatus.PENDIENTE) {
        throw new BadRequestException(`La orden ${order.code} no está pendiente de pago`);
      }
    }

    const agreements = await this.agreementRepo.find({
      where: {
        serviceOrderId: In(uniqueServiceOrderIds),
        status: ServiceOrderAgreementStatus.CONFIRMED,
      },
      relations: ['productItems', 'serviceItems'],
      order: { agreedAt: 'DESC', createdAt: 'DESC' },
    });

    const agreementByOrderId = new Map<number, ServiceOrderAgreement>();
    for (const agreement of agreements) {
      const key = Number(agreement.serviceOrderId);
      if (!agreementByOrderId.has(key)) {
        agreementByOrderId.set(key, agreement);
      }
    }

    const orderDrafts = serviceOrders.map((serviceOrder) => {
      const agreement = agreementByOrderId.get(Number(serviceOrder.id));
      if (!agreement) {
        throw new BadRequestException(`La orden ${serviceOrder.code} no tiene acuerdo confirmado vigente`);
      }
      return {
        serviceOrder,
        agreement,
        totalAmount: Number(agreement.totalAmount ?? 0),
        items: this.buildDraftLinesFromAgreement(serviceOrder, agreement),
      };
    });

    for (const draft of orderDrafts) {
      const existingLink = await this.serviceOrderSaleLinkRepo.findOne({
        where: {
          serviceOrderId: Number(draft.serviceOrder.id),
          agreementId: Number(draft.agreement.id),
          deletedAt: IsNull(),
        } as any,
      });
      if (existingLink) {
        throw new BadRequestException(`La orden ${draft.serviceOrder.code} ya tiene un comprobante ligado al acuerdo vigente`);
      }
    }

    const groupedTotal = Number(
      orderDrafts.reduce((sum, draft) => sum + Number(draft.totalAmount ?? 0), 0).toFixed(2),
    );
    const totalPayments = Number(
      (dto.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toFixed(2),
    );
    if (Math.abs(totalPayments - groupedTotal) > 0.01) {
      throw new BadRequestException(
        `El total de pagos (${totalPayments}) no coincide con el total de los acuerdos seleccionados (${groupedTotal})`,
      );
    }

    const taxpayer = await this.clientRepo.findOne({
      where: { id: Number(dto.taxpayerCustomerId) },
      relations: ['documentType'],
    });
    if (!taxpayer) {
      throw new NotFoundException('Contribuyente fiscal no encontrado');
    }
    this.validateTaxpayerAgainstDocumentType(taxpayer, dto.documentType);

    let finalSeries: string | undefined;
    let finalNumber: string | undefined;
    let documentSeriesId: number | null = null;

    const nextNumber = await this.documentSeriesService.getNextNumber(dto.companyId, dto.documentType);
    finalSeries = nextNumber.series;
    finalNumber = nextNumber.number;
    const documentSeries = await this.documentSeriesService.getActiveByType(dto.companyId, dto.documentType);
    documentSeriesId = documentSeries?.id || null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const cashRegister = await queryRunner.manager.findOne(CashRegister, {
        where: { companyId: dto.companyId, status: 'OPEN' },
      });
      if (!cashRegister) {
        throw new BadRequestException('No hay caja abierta. Debe abrir una caja antes de crear ventas.');
      }

      const sale = await queryRunner.manager.save(
        this.saleRepo.create({
          companyId: dto.companyId,
          customerId: Number(taxpayer.id),
          cashRegisterId: cashRegister.id,
          saleType: dto.saleType ?? SaleType.SERVICE,
          documentType: dto.documentType as DocumentType,
          documentSeriesId,
          series: finalSeries,
          number: finalNumber,
          issueDate: dto.issueDate,
          dueDate: dto.issueDate,
          priceListCode: '',
          applyAutoDiscounts: false,
          baseSubtotal: groupedTotal,
          subtotal: groupedTotal,
          discountTotal: 0,
          taxRate: 0,
          taxAmount: 0,
          total: groupedTotal,
          status: 'CONFIRMED' as SaleStatus,
          createdBy: user,
          confirmedBy: user,
          observations: dto.observations,
          billingSnapshotName: taxpayer.name ?? null,
          billingSnapshotTradeName: taxpayer.tradeName ?? null,
          billingSnapshotDocumentTypeName: taxpayer.documentType?.name ?? null,
          billingSnapshotDocumentNumber: taxpayer.documentNumber ?? null,
          billingSnapshotAddress: taxpayer.address ?? null,
          billingSnapshotEmail: taxpayer.email ?? null,
        }),
      );

      const itemsWithAutoData: Array<{ productId: number; quantity: number; lotId: number | null; serialIds: number[] }> = [];
      for (const draft of orderDrafts) {
        for (const item of draft.items) {
          if (isServiceOrderSaleDraftServiceItem(item)) {
            await queryRunner.manager.save(
              this.saleItemRepo.create({
                saleId: sale.id,
                itemType: 'SERVICE',
                productId: null,
                serviceId: null,
                serviceCodeSnapshot: item.serviceCodeSnapshot ?? 'TECHNICAL_SERVICE',
                serviceNameSnapshot: item.serviceNameSnapshot ?? 'Servicio técnico',
                descriptionSnapshot: item.description ?? item.serviceNameSnapshot ?? 'Servicio técnico',
                lotId: null,
                baseUnitPrice: item.baseUnitPrice,
                finalUnitPrice: item.finalUnitPrice,
                quantity: item.quantity,
                discountAmount: 0,
                taxAmount: 0,
                lineTotal: Number((Number(item.quantity ?? 1) * Number(item.finalUnitPrice ?? 0)).toFixed(2)),
                serialCount: 0,
                isComboItem: false,
                comboId: null,
              }),
            );
            continue;
          }

          if (!isServiceOrderSaleDraftProductItem(item) || !item.productId) {
            throw new BadRequestException('Cada línea de producto requiere productId');
          }

          const lotsData = await this.getAutoLotAndSerials(item.productId, item.quantity);
          for (const lotData of lotsData) {
            itemsWithAutoData.push({
              productId: item.productId,
              quantity: lotData.quantityFromThisLot,
              lotId: lotData.lotId,
              serialIds: lotData.serialIds,
            });
          }

          const firstLotData = lotsData[0];
          await queryRunner.manager.save(
            this.saleItemRepo.create({
              saleId: sale.id,
              itemType: 'PRODUCT',
              productId: item.productId,
              serviceId: null,
              serviceCodeSnapshot: null,
              serviceNameSnapshot: null,
              descriptionSnapshot: item.description,
              lotId: firstLotData?.lotId ?? null,
              baseUnitPrice: item.baseUnitPrice,
              finalUnitPrice: item.finalUnitPrice,
              quantity: item.quantity,
              discountAmount: 0,
              taxAmount: 0,
              lineTotal: Number((Number(item.quantity ?? 1) * Number(item.finalUnitPrice ?? 0)).toFixed(2)),
              serialCount: firstLotData?.serialIds?.length || 0,
              isComboItem: false,
              comboId: null,
            }),
          );
        }
      }

      let currentBalance = Number(cashRegister.currentBalance ?? 0);
      for (const paymentDto of dto.payments ?? []) {
        await queryRunner.manager.save(
          this.salePaymentRepo.create({
            saleId: sale.id,
            method: paymentDto.method as PaymentMethod,
            amount: paymentDto.amount,
            reference: paymentDto.reference,
            bankName: paymentDto.bankName,
            cardType: paymentDto.cardType,
            paymentDate: paymentDto.paymentDate ? new Date(paymentDto.paymentDate) : new Date(),
          }),
        );

        const paymentAmount = Number(paymentDto.amount ?? 0);
        switch (paymentDto.method) {
          case 'CASH':
            currentBalance += paymentAmount;
            cashRegister.currentBalance = currentBalance;
            cashRegister.expectedBalance = Number(cashRegister.expectedBalance ?? 0) + paymentAmount;
            cashRegister.totalCash = Number(cashRegister.totalCash ?? 0) + paymentAmount;
            break;
          case 'CARD':
            cashRegister.totalCard = Number(cashRegister.totalCard ?? 0) + paymentAmount;
            break;
          case 'TRANSFER':
            cashRegister.totalTransfer = Number(cashRegister.totalTransfer ?? 0) + paymentAmount;
            break;
          case 'YAPE':
            cashRegister.totalYape = Number(cashRegister.totalYape ?? 0) + paymentAmount;
            break;
          case 'PLIN':
            cashRegister.totalPlin = Number(cashRegister.totalPlin ?? 0) + paymentAmount;
            break;
          case 'CREDIT':
            break;
        }

        await queryRunner.manager.save(
          this.transactionRepo.create({
            cashRegisterId: cashRegister.id,
            saleId: sale.id,
            type: 'SALE_PAYMENT',
            subtype: paymentDto.method as any,
            amount: paymentAmount,
            balanceAfter: currentBalance,
            description: `Venta agrupada por acuerdos ${orderDrafts.map((draft) => draft.serviceOrder.code).join(', ')}`,
            reference: `${finalSeries}-${finalNumber}`,
            recordedBy: user,
            recordedAt: new Date(),
          } as any),
        );
      }

      await queryRunner.manager.save(cashRegister);

      for (const draft of orderDrafts) {
        await queryRunner.manager.save(
          this.serviceOrderSaleLinkRepo.create({
            saleId: Number(sale.id),
            serviceOrderId: Number(draft.serviceOrder.id),
            agreementId: Number(draft.agreement.id),
            linkedAmount: draft.totalAmount,
            linkedBy: user,
            linkedAt: new Date(),
          }),
        );
        await queryRunner.manager.save(
          ServiceOrder,
          this.serviceOrderRepo.create({
            ...draft.serviceOrder,
            montoComprometidoVigente: draft.totalAmount,
            montoReconciliado: draft.totalAmount,
            economicStatus: ServiceOrderEconomicStatus.TOTAL,
          }),
        );
      }

      if (itemsWithAutoData.length) {
        await this.salesInventory.registerSaleMovement(sale.id, itemsWithAutoData, user);
      }

      await queryRunner.commitTransaction();
      return this.findOne(sale.id);
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
      paymentType,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
    } = filterDto;

    const query = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.items', 'i')
      .leftJoinAndSelect('i.product', 'p')
      .leftJoinAndSelect('s.payments', 'pay')
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

    if (paymentType) {
      query.andWhere('pay.method = :paymentType', { paymentType });
    }

    if (dateFrom) {
      query.andWhere('DATE(s.createdAt) >= DATE(:dateFrom)', { dateFrom });
    }

    if (dateTo) {
      const dateToPlusOne = new Date(dateTo);
      dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
      const dateToStr = dateToPlusOne.toISOString().split('T')[0];
      query.andWhere('DATE(s.createdAt) < DATE(:dateTo)', { dateTo: dateToStr });
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

  private buildDraftLinesFromAgreement(
    serviceOrder: ServiceOrder,
    agreement: ServiceOrderAgreement,
  ): ServiceOrderSaleDraftLine[] {
    const orderLabel = `Orden ${serviceOrder.code}`;
    return [
      ...(agreement.productItems ?? []).map((item) => ({
        itemType: SaleItemKindDto.PRODUCT as const,
        productId: item.productId,
        quantity: Number(item.quantity ?? 0),
        baseUnitPrice: Number(item.unitPrice ?? 0),
        finalUnitPrice: Number(item.unitPrice ?? 0),
        description: `${item.productNameSnapshot} - ${orderLabel}`,
      })),
      ...(agreement.serviceItems ?? []).map((item) => ({
        itemType: SaleItemKindDto.SERVICE as const,
        quantity: 1,
        baseUnitPrice: Number(item.unitPrice ?? 0),
        finalUnitPrice: Number(item.unitPrice ?? 0),
        description: `Servicio técnico - ${orderLabel}`,
        serviceCodeSnapshot: item.serviceCodeSnapshot,
        serviceNameSnapshot: item.serviceNameSnapshot,
      })),
    ];
  }

  private validateTaxpayerAgainstDocumentType(taxpayer: Client, documentType: DocumentType): void {
    if (documentType === DocumentType.FACTURA && taxpayer.kind !== ClientKind.COMPANY) {
      throw new BadRequestException('Una factura requiere un contribuyente empresa');
    }
    if (documentType === DocumentType.BOLETA && taxpayer.kind !== ClientKind.PERSON) {
      throw new BadRequestException('Una boleta requiere un contribuyente persona natural');
    }
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
      ],
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    // Obtener los seriales de cada item de venta
    // Buscar movimientos relacionados con esta venta
    const movements = await this.movementRepo.find({
      where: {
        sourceDocType: 'SALE',
        sourceDocId: String(id),
      },
      relations: ['serial', 'lot'],
    });

    // Agrupar seriales por productId y lotId
    const serialsByItem = new Map<string, Array<{ serialId: number; serialCode: string; lotCode?: string; expirationDate?: string }>>();

    for (const movement of movements) {
      // Buscar los MovementSerial relacionados a este movimiento
      const movementSerials = await this.movementSerialRepo.find({
        where: { movementId: movement.id },
        relations: ['serial'],
      });

      for (const ms of movementSerials) {
        const key = `${movement.productId}`;
        if (!serialsByItem.has(key)) {
          serialsByItem.set(key, []);
        }
        serialsByItem.get(key)!.push({
          serialId: ms.serialId,
          serialCode: ms.serial.serialCode,
          lotCode: movement.lot?.lotCode || undefined,
          expirationDate: movement.lot?.expirationDate ? new Date(movement.lot.expirationDate).toISOString().split('T')[0] : undefined,
        });
      }
    }

    // Agregar los seriales a cada item
    for (const item of sale.items) {
      const key = `${item.productId}`;
      const itemSerials = serialsByItem.get(key) || [];
      (item as any).serials = itemSerials;
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
  async getMetrics(
    companyId: number,
    dateFrom?: string,
    dateTo?: string,
    status?: string,
    documentType?: string,
    paymentType?: string,
  ) {
    const query = this.saleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.payments', 'pay')
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
      query.andWhere('DATE(s.createdAt) >= DATE(:dateFrom)', { dateFrom });
    }

    if (dateTo) {
      const dateToPlusOne = new Date(dateTo);
      dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
      const dateToStr = dateToPlusOne.toISOString().split('T')[0];
      query.andWhere('DATE(s.createdAt) < DATE(:dateTo)', { dateTo: dateToStr });
    }

    if (status) {
      query.andWhere('s.status = :status', { status });
    }

    if (documentType) {
      query.andWhere('s.documentType = :documentType', { documentType });
    }

    if (paymentType) {
      query.andWhere('pay.method = :paymentType', { paymentType });
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
      query.andWhere('DATE(s.createdAt) >= DATE(:dateFrom)', { dateFrom });
    }

    if (dateTo) {
      const dateToPlusOne = new Date(dateTo);
      dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
      const dateToStr = dateToPlusOne.toISOString().split('T')[0];
      query.andWhere('DATE(s.createdAt) < DATE(:dateTo)', { dateTo: dateToStr });
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

  // =========================
  // REPORTE DE IMPUESTO A LA RENTA
  // =========================
  async getIncomeTaxReport(companyId: number, year: number) {
    const ratePct = await this.taxConfigService.getRentaRate();
    const rateDecimal = ratePct / 100;

    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year + 1}-01-01T00:00:00Z`);

    const sales = await this.saleRepo
      .createQueryBuilder('s')
      .select([
        'MONTH(s.createdAt) as month',
        'SUM(s.subtotal) as totalRevenue', // Base imponible de los ingresos brutos
      ])
      .where('s.companyId = :companyId', { companyId })
      .andWhere('s.status = "CONFIRMED"')
      .andWhere('s.createdAt >= :startDate', { startDate })
      .andWhere('s.createdAt < :endDate', { endDate })
      .groupBy('MONTH(s.createdAt)')
      .getRawMany();

    // Map results to array length 12
    const breakdown = Array.from({ length: 12 }).map((_, i) => {
      const monthNumber = i + 1;
      const data = sales.find(s => parseInt(s.month) === monthNumber);
      const baseTotal = data ? parseFloat(data.totalRevenue) : 0;
      const taxDue = baseTotal * rateDecimal;

      return {
        month: monthNumber,
        baseTotal,
        taxDue,
      };
    });

    const yearlyBaseTotal = breakdown.reduce((sum, b) => sum + b.baseTotal, 0);
    const yearlyTaxDue = breakdown.reduce((sum, b) => sum + b.taxDue, 0);

    return {
      year,
      rentaRatePct: ratePct,
      yearlyBaseTotal,
      yearlyTaxDue,
      breakdown,
    };
  }
}
