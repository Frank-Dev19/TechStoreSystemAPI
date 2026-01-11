// src/sales/services/sales-pricing.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingEngineService } from 'src/pricing/services/pricing-engine.service';
import { PricingSimulationService } from 'src/pricing/services/pricing-simulation.service';
import { CombosService } from 'src/pricing/services/combos.service';
import { Product } from 'src/inventory/entities/product.entity';
import { Combo } from 'src/pricing/entities/combo.entity';

export interface ProductPricingResult {
    productId: number;
    productName: string;
    sku: string;
    quantity: number;

    // PRECIOS POR UNIDAD
    baseUnitPrice: number;      // Precio SIN descuento
    finalUnitPrice: number;     // Precio CON descuento
    unitDiscount: number;       // Descuento por unidad (baseUnitPrice - finalUnitPrice)

    // TOTALES
    baseSubtotal: number;       // baseUnitPrice × quantity
    finalSubtotal: number;      // finalUnitPrice × quantity
    totalDiscount: number;      // unitDiscount × quantity

    // Descuentos
    discounts: Array<{
        ruleId?: number;
        name: string;
        type: string;
        amount: number; // Porcentaje o monto
        value: number;  // Valor monetario POR UNIDAD
        source: string;
        priority: number;
    }>;

    // Combos disponibles
    availableCombos: Array<{
        comboId: number;
        name: string;
        type: string;
        comboPrice?: number;
        discountPercent?: number;
        savings: number;
        items: Array<{
            productId: number;
            productName: string;
            quantity: number;
        }>;
    }>;
}

@Injectable()
export class SalesPricingService {
    constructor(
        private readonly pricingEngine: PricingEngineService,
        private readonly pricingSimulation: PricingSimulationService,
        private readonly combosService: CombosService,

        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
        @InjectRepository(Combo)
        private readonly comboRepo: Repository<Combo>,
    ) { }

    async getProductPricing(params: {
        productId: number;
        quantity: number;
        priceListCode?: string;
        applyAutoDiscounts?: boolean;
        userPermissions?: string[];
        date?: Date;
    }): Promise<ProductPricingResult> {
        const product = await this.productRepo.findOne({
            where: { id: params.productId },
        });

        if (!product) {
            throw new BadRequestException(`Producto con ID ${params.productId} no encontrado`);
        }

        try {
            // Consultar precio con el Pricing Engine
            const priceResult = await this.pricingEngine.getProductPrice({
                product_id: params.productId,
                qty: params.quantity,
                price_list_code: params.priceListCode,
                date: params.date?.toISOString().split('T')[0],
                user_permissions: params.userPermissions || [],
            });

            // Buscar combos disponibles para este producto
            const allCombos = await this.combosService.findAll({ activeOnly: true });
            const availableCombos = allCombos.filter(combo =>
                combo.items.some(item => item.productId === params.productId)
            );

            // Calcular ahorro para cada combo
            const combosWithSavings = await Promise.all(
                availableCombos.map(async (combo) => {
                    // Calcular precio individual de los componentes
                    let individualTotal = 0;
                    for (const item of combo.items) {
                        try {
                            const itemPrice = await this.pricingEngine.getBestPriceForQty({
                                product_id: item.productId,
                                qty: item.qty,
                                date: params.date?.toISOString().split('T')[0],
                                user_permissions: params.userPermissions || [],
                            });
                            individualTotal += itemPrice.applied.finalUnitPrice * item.qty;
                        } catch (error) {
                            // Si no hay precio para algún componente, omitir este combo
                            continue;
                        }
                    }

                    let comboPrice: number;
                    if (combo.comboType === 'FIXED_PRICE') {
                        comboPrice = Number(combo.comboPrice);
                    } else {
                        const discount = Number(combo.discountPercent) / 100;
                        comboPrice = individualTotal * (1 - discount);
                    }

                    const savings = individualTotal - comboPrice;

                    return {
                        comboId: combo.id,
                        name: combo.name,
                        type: combo.comboType,
                        comboPrice: combo.comboType === 'FIXED_PRICE' ? Number(combo.comboPrice) : undefined,
                        discountPercent: combo.comboType === 'PERCENT' ? Number(combo.discountPercent) : undefined,
                        savings,
                        items: combo.items.map(item => ({
                            productId: item.productId,
                            productName: item.product?.name || `ID ${item.productId}`,
                            quantity: item.qty,
                        })),
                    };
                })
            );

            // Filtrar combos con ahorro positivo
            const validCombos = combosWithSavings.filter(c => c.savings > 0);

            // CALCULAR VALORES CLAROS
            const unitDiscount = priceResult.baseUnitPrice - priceResult.finalUnitPrice;
            const baseSubtotal = priceResult.baseUnitPrice * params.quantity;
            const finalSubtotal = priceResult.finalUnitPrice * params.quantity;
            const totalDiscount = unitDiscount * params.quantity;

            return {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                quantity: params.quantity,

                // Por unidad
                baseUnitPrice: priceResult.baseUnitPrice,
                finalUnitPrice: priceResult.finalUnitPrice,
                unitDiscount,

                // Totales
                baseSubtotal,
                finalSubtotal,
                totalDiscount,

                // Descuentos
                discounts: priceResult.autoAppliedDiscounts.map(d => ({
                    ruleId: d.id,
                    name: d.name,
                    type: d.discountType,
                    amount: d.amount,
                    value: d.discountType === 'PERCENT'
                        ? (priceResult.baseUnitPrice * d.amount / 100)
                        : d.amount,
                    source: 'RULE_AUTO',
                    priority: d.priority,
                })),

                availableCombos: validCombos,
            };
        } catch (error) {
            throw new BadRequestException(
                `Error al calcular precio para producto ${product.name}: ${error.message}`,
            );
        }
    }

    async simulateSale(simulationData: {
        customerId: number;
        saleType: string;
        items: Array<{ productId: number; quantity: number; comboId?: number }>;
        priceListCode?: string;
        applyAutoDiscounts?: boolean;
        userPermissions?: string[];
    }) {
        // Simular cada producto
        const itemResults = await Promise.all(
            simulationData.items.map(async (item) => {
                return this.getProductPricing({
                    productId: item.productId,
                    quantity: item.quantity,
                    priceListCode: simulationData.priceListCode,
                    applyAutoDiscounts: simulationData.applyAutoDiscounts,
                    userPermissions: simulationData.userPermissions,
                });
            })
        );

        // Calcular totales CORRECTAMENTE
        const baseSubtotal = itemResults.reduce((sum, item) => sum + item.baseSubtotal, 0);
        const discountTotal = itemResults.reduce((sum, item) => sum + item.totalDiscount, 0);
        const subtotal = baseSubtotal - discountTotal;
        const taxRate = 0.18;
        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount;

        return {
            items: itemResults,
            summary: {
                baseSubtotal,
                discountTotal,
                subtotal,
                taxRate,
                taxAmount,
                total,
            },
            validation: {
                isValid: true,
                messages: [],
            },
        };
    }
}