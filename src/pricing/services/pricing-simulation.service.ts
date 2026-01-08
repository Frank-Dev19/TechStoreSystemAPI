// src/pricing/services/pricing-simulation.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from 'src/inventory/entities/product.entity';
import { Combo } from '../entities/combo.entity';
import { PricingEngineService } from './pricing-engine.service';
import { CombosService } from './combos.service';
import { SimulationQueryDto, BatchSimulationQueryDto } from '../dto/simulation-query.dto2';
import { ComboType } from '../enums/combo-type.enum';

export interface SimulationResult {
    type: 'product' | 'combo';
    productId?: number;
    productName?: string;
    productSku?: string;
    comboId?: number;
    comboName?: string;
    qty: number;
    selectedOption: {
        priceListId: number;
        priceListCode: string;
        priceListName: string;
        baseUnitPrice: number;
        finalUnitPrice: number;
        totalPrice: number;
        currency: string;
    };
    priceBreakdown: {
        base: {
            priceListCode: string;
            unitPrice: number;
            qtyRange: string;
        };
        discounts: {
            totalDiscount: number;
            details: {
                id: number;
                name: string;
                type: string;
                amount: number;
                unitDiscount: number;
                totalDiscount: number;
                priority: number;
                applied: boolean;
            }[];
        };
        combos: {
            applied: {
                id: number;
                code: string;
                name: string;
                type: string;
                comboPrice?: number;
                discountPercent?: number;
                savings?: number;
                items: {
                    productId: number;
                    productName: string;
                    qty: number;
                }[];
            }[];
            available: {
                id: number;
                code: string;
                name: string;
                type: string;
                comboPrice?: number;
                discountPercent?: number;
                potentialSavings?: number;
                items: {
                    productId: number;
                    productName: string;
                    qty: number;
                }[];
            }[];
        };
    };
    alternatives: {
        priceListCode: string;
        priceListName: string;
        finalUnitPrice: number;
        totalPrice: number;
        savingsVsSelected: number;
    }[];
    validationIssues: {
        type: 'ERROR' | 'WARNING' | 'INFO';
        message: string;
    }[];
}

@Injectable()
export class PricingSimulationService {
    constructor(
        @InjectRepository(Product)
        private readonly prodRepo: Repository<Product>,
        @InjectRepository(Combo)
        private readonly comboRepo: Repository<Combo>,
        private readonly pricingEngine: PricingEngineService,
        private readonly combosService: CombosService,
    ) { }

    async simulate(dto: SimulationQueryDto): Promise<SimulationResult> {
        // Validar que se proporcione product_id o combo_id
        if (!dto.product_id && !dto.combo_id) {
            throw new BadRequestException('Debe proporcionar product_id o combo_id');
        }

        if (dto.product_id) {
            return this.simulateProduct(dto);
        } else {
            return this.simulateCombo(dto);
        }
    }

    private async simulateProduct(dto: SimulationQueryDto): Promise<SimulationResult> {
        const product = await this.prodRepo.findOne({
            where: { id: dto.product_id },
            relations: ['category'],
        });

        if (!product) {
            throw new BadRequestException('Producto no encontrado');
        }

        const validationIssues: SimulationResult['validationIssues'] = [];

        // Si se especificó una lista de precios, usar esa; sino, calcular la mejor
        let priceResult;
        let alternatives: SimulationResult['alternatives'] = [];

        if (dto.price_list_code) {
            // Precio específico de una lista
            try {
                priceResult = await this.pricingEngine.getProductPrice({
                    product_id: dto.product_id!,
                    qty: dto.qty,
                    price_list_code: dto.price_list_code,
                    date: dto.date,
                    user_permissions: dto.user_permissions,
                });

                // Calcular alternativas (otras listas)
                const bestPriceResponse = await this.pricingEngine.getBestPriceForQty({
                    product_id: dto.product_id!,
                    qty: dto.qty,
                    date: dto.date,
                    user_permissions: dto.user_permissions,
                });

                alternatives = bestPriceResponse.options
                    .filter(opt => opt.priceListCode !== dto.price_list_code)
                    .map(opt => ({
                        priceListCode: opt.priceListCode,
                        priceListName: opt.priceListCode, // Podrías mejorar esto con el nombre completo
                        finalUnitPrice: opt.finalUnitPrice,
                        totalPrice: opt.finalUnitPrice * dto.qty,
                        savingsVsSelected: (priceResult.finalUnitPrice - opt.finalUnitPrice) * dto.qty,
                    }));
            } catch (error) {
                validationIssues.push({
                    type: 'ERROR',
                    message: `No se pudo calcular el precio para la lista ${dto.price_list_code}: ${error.message}`,
                });
                throw error;
            }
        } else {
            // Mejor precio entre todas las listas
            const bestPriceResponse = await this.pricingEngine.getBestPriceForQty({
                product_id: dto.product_id!,
                qty: dto.qty,
                date: dto.date,
                user_permissions: dto.user_permissions,
            });

            priceResult = bestPriceResponse.applied;

            alternatives = bestPriceResponse.options
                .filter(opt => opt.priceListCode !== priceResult.priceListCode)
                .map(opt => ({
                    priceListCode: opt.priceListCode,
                    priceListName: opt.priceListCode,
                    finalUnitPrice: opt.finalUnitPrice,
                    totalPrice: opt.finalUnitPrice * dto.qty,
                    savingsVsSelected: (priceResult.finalUnitPrice - opt.finalUnitPrice) * dto.qty,
                }));
        }

        // Buscar combos disponibles que incluyan este producto
        const availableCombos = dto.include_combos
            ? await this.findCombosForProduct(dto.product_id!, dto.qty)
            : [];

        // Construir resultado
        const result: SimulationResult = {
            type: 'product',
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
            qty: dto.qty,
            selectedOption: {
                priceListId: priceResult.priceListId,
                priceListCode: priceResult.priceListCode,
                priceListName: priceResult.priceListCode,
                baseUnitPrice: priceResult.baseUnitPrice,
                finalUnitPrice: priceResult.finalUnitPrice,
                totalPrice: priceResult.finalUnitPrice * dto.qty,
                currency: priceResult.currency,
            },
            priceBreakdown: {
                base: {
                    priceListCode: priceResult.priceListCode,
                    unitPrice: priceResult.baseUnitPrice,
                    qtyRange: `${dto.qty} unidades`,
                },
                discounts: {
                    totalDiscount: (priceResult.baseUnitPrice - priceResult.finalUnitPrice) * dto.qty,
                    details: priceResult.autoAppliedDiscounts.map(d => ({
                        id: d.id,
                        name: d.name,
                        type: d.discountType,
                        amount: d.amount,
                        unitDiscount: this.calculateUnitDiscount(d, priceResult.baseUnitPrice),
                        totalDiscount: this.calculateUnitDiscount(d, priceResult.baseUnitPrice) * dto.qty,
                        priority: d.priority,
                        applied: true,
                    })),
                },
                combos: {
                    applied: [],
                    available: availableCombos,
                },
            },
            alternatives,
            validationIssues,
        };

        // Agregar detalles técnicos si se solicitan
        if (dto.include_technical_details) {
            this.addTechnicalDetails(result, priceResult);
        }

        return result;
    }

    private async simulateCombo(dto: SimulationQueryDto): Promise<SimulationResult> {
        const combo = await this.comboRepo.findOne({
            where: { id: dto.combo_id },
            relations: ['items', 'items.product'],
        });

        if (!combo) {
            throw new BadRequestException('Combo no encontrado');
        }

        if (!combo.isActive) {
            throw new BadRequestException('El combo no está activo');
        }

        // Calcular precio del combo
        let comboTotalPrice: number;
        let individualTotalPrice = 0;

        // Calcular precio individual de los items
        for (const item of combo.items) {
            const priceResult = await this.pricingEngine.getBestPriceForQty({
                product_id: item.productId,
                qty: item.qty * dto.qty, // multiplicar por cantidad de combos
                date: dto.date,
            });
            individualTotalPrice += priceResult.applied.finalUnitPrice * item.qty * dto.qty;
        }

        if (combo.comboType === ComboType.FIXED_PRICE) {
            comboTotalPrice = Number(combo.comboPrice) * dto.qty;
        } else {
            // PERCENT
            const discount = Number(combo.discountPercent) / 100;
            comboTotalPrice = individualTotalPrice * (1 - discount);
        }

        const savings = individualTotalPrice - comboTotalPrice;

        const result: SimulationResult = {
            type: 'combo',
            comboId: combo.id,
            comboName: combo.name,
            qty: dto.qty,
            selectedOption: {
                priceListId: 0,
                priceListCode: 'COMBO',
                priceListName: 'Precio de Combo',
                baseUnitPrice: individualTotalPrice / dto.qty,
                finalUnitPrice: comboTotalPrice / dto.qty,
                totalPrice: comboTotalPrice,
                currency: 'PEN',
            },
            priceBreakdown: {
                base: {
                    priceListCode: 'COMBO',
                    unitPrice: individualTotalPrice / dto.qty,
                    qtyRange: `${dto.qty} combo(s)`,
                },
                discounts: {
                    totalDiscount: savings,
                    details: [],
                },
                combos: {
                    applied: [{
                        id: combo.id,
                        code: combo.code,
                        name: combo.name,
                        type: combo.comboType,
                        comboPrice: combo.comboType === ComboType.FIXED_PRICE ? Number(combo.comboPrice) : undefined,
                        discountPercent: combo.comboType === ComboType.PERCENT ? Number(combo.discountPercent) : undefined,
                        savings,
                        items: combo.items.map(item => ({
                            productId: item.productId,
                            productName: item.product?.name || `ID ${item.productId}`,
                            qty: item.qty,
                        })),
                    }],
                    available: [],
                },
            },
            alternatives: [],
            validationIssues: [],
        };

        return result;
    }

    private async findCombosForProduct(productId: number, qty: number): Promise<any[]> {
        const combos = await this.combosService.findAll({ activeOnly: true });

        const relevantCombos = combos.filter(combo =>
            combo.items.some(item => item.productId === productId)
        );

        // 👇 AQUÍ ESTÁ LA CORRECCIÓN: Especificar el tipo explícitamente
        const results: Array<{
            id: number;
            code: string;
            name: string;
            type: string;
            comboPrice?: number;
            discountPercent?: number;
            potentialSavings?: number;
            items: {
                productId: number;
                productName: string;
                qty: number;
            }[];
        }> = [];

        for (const combo of relevantCombos) {
            // Calcular precio individual de los items del combo
            let individualTotal = 0;

            for (const item of combo.items) {
                try {
                    const priceResult = await this.pricingEngine.getBestPriceForQty({
                        product_id: item.productId,
                        qty: item.qty,
                    });
                    individualTotal += priceResult.applied.finalUnitPrice * item.qty;
                } catch (error) {
                    // Si no hay precio para algún producto, saltar este combo
                    continue;
                }
            }

            let comboPrice: number;
            if (combo.comboType === ComboType.FIXED_PRICE) {
                comboPrice = Number(combo.comboPrice);
            } else {
                const discount = Number(combo.discountPercent) / 100;
                comboPrice = individualTotal * (1 - discount);
            }

            const potentialSavings = individualTotal - comboPrice;

            results.push({
                id: combo.id,
                code: combo.code,
                name: combo.name,
                type: combo.comboType,
                comboPrice: combo.comboType === ComboType.FIXED_PRICE ? Number(combo.comboPrice) : undefined,
                discountPercent: combo.comboType === ComboType.PERCENT ? Number(combo.discountPercent) : undefined,
                potentialSavings,
                items: combo.items.map(item => ({
                    productId: item.productId,
                    productName: item.product?.name || `ID ${item.productId}`,
                    qty: item.qty,
                })),
            });
        }

        return results;
    }

    private calculateUnitDiscount(discount: any, basePrice: number): number {
        if (discount.discountType === 'PERCENT') {
            return (basePrice * Number(discount.amount)) / 100;
        } else {
            return Number(discount.amount);
        }
    }

    private addTechnicalDetails(result: SimulationResult, priceResult: any): void {
        // Agregar información técnica adicional para debugging
        result.validationIssues.push({
            type: 'INFO',
            message: `Precio obtenido de lista ${priceResult.priceListCode}`,
        });

        if (priceResult.autoAppliedDiscounts.length > 0) {
            result.validationIssues.push({
                type: 'INFO',
                message: `${priceResult.autoAppliedDiscounts.length} descuento(s) aplicado(s) automáticamente`,
            });
        }

        if (priceResult.manualDiscountOptions.length > 0) {
            result.validationIssues.push({
                type: 'INFO',
                message: `${priceResult.manualDiscountOptions.length} descuento(s) manual(es) disponible(s)`,
            });
        }
    }

    async batchSimulate(dto: BatchSimulationQueryDto): Promise<SimulationResult[]> {
        const results: SimulationResult[] = [];

        for (const productId of dto.product_ids) {
            for (const qty of dto.quantities) {
                for (const priceListCode of dto.price_list_codes) {
                    try {
                        const result = await this.simulate({
                            product_id: productId,
                            qty,
                            price_list_code: priceListCode,
                            include_combos: true,
                            include_technical_details: true,
                        });
                        results.push(result);
                    } catch (error) {
                        // Agregar resultado con error
                        results.push({
                            type: 'product',
                            productId,
                            qty,
                            selectedOption: null as any,
                            priceBreakdown: null as any,
                            alternatives: [],
                            validationIssues: [{
                                type: 'ERROR',
                                message: `Error al simular producto ${productId} con cantidad ${qty} en lista ${priceListCode}: ${error.message}`,
                            }],
                        });
                    }
                }
            }
        }

        return results;
    }

    async generateAuditReportCSV(results: SimulationResult[]): Promise<string> {
        const headers = [
            'Producto',
            'SKU',
            'Cantidad',
            'Lista de Precios',
            'Precio Base',
            'Precio Final',
            'Total',
            'Descuentos Aplicados',
            'Combos Disponibles',
            'Problemas',
        ];

        const rows = results.map(result => {
            const discounts = result.priceBreakdown?.discounts?.details
                .filter(d => d.applied)
                .map(d => d.name)
                .join('; ') || 'Ninguno';

            const combos = result.priceBreakdown?.combos?.available
                .map(c => c.name)
                .join('; ') || 'Ninguno';

            const issues = result.validationIssues
                .filter(i => i.type === 'ERROR' || i.type === 'WARNING')
                .map(i => i.message)
                .join('; ') || 'OK';

            return [
                result.productName || result.comboName || 'N/A',
                result.productSku || 'N/A',
                result.qty,
                result.selectedOption?.priceListCode || 'N/A',
                result.selectedOption?.baseUnitPrice?.toFixed(2) || 'N/A',
                result.selectedOption?.finalUnitPrice?.toFixed(2) || 'N/A',
                result.selectedOption?.totalPrice?.toFixed(2) || 'N/A',
                discounts,
                combos,
                issues,
            ];
        });

        // Construir CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
        ].join('\n');

        return csvContent;
    }
}