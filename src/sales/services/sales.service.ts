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
import { Service } from 'src/service-catalog/entities/service.entity';
import { Combo } from 'src/pricing/entities/combo.entity';
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
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(Combo)
    private readonly comboRepo: Repository<Combo>,
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
          if (!item.serviceId) {
            throw new BadRequestException('Cada línea de servicio requiere serviceId');
          }

          const service = await this.serviceRepo.findOne({ where: { id: item.serviceId } });
          if (!service) {
            throw new BadRequestException(`Servicio con ID ${item.serviceId} no encontrado`);
          }

          const unitPrice = Number(item.finalUnitPrice ?? service.price ?? 0);
          const finalSubtotal = Number((unitPrice * Number(item.quantity)).toFixed(2));

          return {
            item,
            stockValidation: {
              isValid: true,
              warning: null,
            },
            pricing: {
              itemType: SaleItemKindDto.SERVICE,
              productId: null,
              serviceId: service.id,
              productName: service.name,
              sku: service.code,
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
          priceListCode: simulateDto.priceListCode,
          applyAutoDiscounts: simulateDto.applyAutoDiscounts ?? true,
          userPermissions: [...userPermissions, ...(simulateDto.userPermissions || [])],
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

    // Si no se especifica priceListCode, determinarlo automáticamente
    let finalPriceListCode = createSaleDto.priceListCode;
    let enhancedItems = createSaleDto.items;

    if (!finalPriceListCode) {
      // Para cada item, obtener el mejor precio disponible
      enhancedItems = [];

      for (const item of createSaleDto.items) {
        if (item.itemType === SaleItemKindDto.SERVICE) {
          const service = item.serviceId
            ? await this.serviceRepo.findOne({ where: { id: item.serviceId } })
            : null;
          const servicePrice = Number(item.finalUnitPrice ?? item.baseUnitPrice ?? service?.price ?? 0);
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
          if (!itemDto.serviceId) {
            throw new BadRequestException('Cada línea de servicio requiere serviceId');
          }

          const service = await this.serviceRepo.findOne({ where: { id: itemDto.serviceId } });
          if (!service) {
            throw new BadRequestException(`Servicio con ID ${itemDto.serviceId} no encontrado`);
          }

          const saleItem = this.saleItemRepo.create({
            saleId: savedSale.id,
            itemType: 'SERVICE',
            productId: null,
            serviceId: service.id,
            serviceCodeSnapshot: service.code,
            serviceNameSnapshot: service.name,
            descriptionSnapshot: itemDto.description ?? service.name,
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
}
