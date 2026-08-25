/**
 * Motor de Precios basado en CPP + Porcentajes.
 *
 * Fórmulas:
 *   precioVenta     = CPP × (1 + utilidad%)
 *   precioMinimo    = CPP × (1 + utilidad% − rebajaMax%)
 *   precioConIGV    = precioVenta × (1 + IGV%)
 *   precioMinConIGV = precioMinimo × (1 + IGV%)
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Stock } from 'src/inventory/entities/stock.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Movement } from 'src/inventory/entities/movement.entity';
import { PricingConfigService } from './pricing-config.service';
import { TaxConfigService } from './tax-config.service';

export interface PriceCalculation {
    productId: number;
    productName: string;
    sku: string;

    // Costo
    cpp: number;                  // Costo Promedio Ponderado

    // Configuración aplicada
    profitMarginPct: number;      // % utilidad
    maxDiscountPct: number;       // % rebaja máxima
    configScope: 'product' | 'category' | 'global';

    // Precios calculados (sin IGV)
    salePrice: number;            // CPP × (1 + utilidad%)
    minPrice: number;             // CPP × (1 + utilidad% − rebajaMax%)

    // IGV
    igvRate: number;              // Tasa de IGV (ej: 18)

    // Precios con IGV
    salePriceWithIgv: number;     // salePrice × (1 + IGV%)
    minPriceWithIgv: number;      // minPrice × (1 + IGV%)

    // Stock disponible
    stockQty: number;

    // Precio final sugerido al operador (incluye IGV)
    recommendedPrice: number;
    minAllowedPrice: number;

    // Trazabilidad interna; no se muestra en el editor de cotizaciones
    costSource: 'CURRENT_STOCK' | 'MOVEMENT_HISTORY';
}

export interface DiscountValidation {
    isValid: boolean;
    discountPct: number;
    maxAllowed: number;
    finalPrice: number;
    finalPriceWithIgv: number;
    message?: string;
}

@Injectable()
export class PricingEngineService {
    constructor(
        @InjectRepository(Stock)
        private readonly stockRepo: Repository<Stock>,
        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
        @InjectRepository(Movement)
        private readonly movementRepo: Repository<Movement>,
        private readonly configService: PricingConfigService,
        private readonly taxService: TaxConfigService,
    ) {}

    /**
     * Obtener el CPP actual de un producto (sumando todos sus lotes de stock).
     */
    private async getCPP(productId: number): Promise<{
        cpp: number;
        stockQty: number;
        costSource: 'CURRENT_STOCK' | 'MOVEMENT_HISTORY';
    }> {
        const stockLines = await this.stockRepo.find({
            where: { productId },
        });

        let totalQty = 0;
        let totalCost = 0;

        for (const line of stockLines) {
            const qty = Number(line.qtyOnHand);
            if (qty > 0) {
                totalQty += qty;
                totalCost += Number(line.totalCost);
            }
        }

        const currentCpp = totalQty > 0 ? totalCost / totalQty : 0;
        if (currentCpp > 0) {
            return { cpp: currentCpp, stockQty: totalQty, costSource: 'CURRENT_STOCK' };
        }

        const latestCostMovement = await this.movementRepo.findOne({
            where: { productId, unitCost: MoreThan(0) },
            order: { occurredAt: 'DESC', id: 'DESC' },
        });
        const historicalCost = Number(latestCostMovement?.unitCost ?? 0);
        if (historicalCost <= 0) {
            throw new BadRequestException(
                'El producto no tiene un costo vigente ni historico para calcular un precio recomendado',
            );
        }
        return {
            cpp: historicalCost,
            stockQty: totalQty,
            costSource: 'MOVEMENT_HISTORY',
        };
    }

    /**
     * Calcular precio completo para un producto.
     */
    async calculatePrice(productId: number): Promise<PriceCalculation> {
        const product = await this.productRepo.findOne({
            where: { id: productId },
        });
        if (!product) throw new BadRequestException('Producto no encontrado');

        // 1) CPP
        const { cpp, stockQty, costSource } = await this.getCPP(productId);

        // 2) Configuración de márgenes
        const { config, scope } = await this.configService.resolveForProduct(productId);
        const profitPct = Number(config.profitMarginPct);
        const maxDiscPct = Number(config.maxDiscountPct);

        // 3) IGV
        const igvRate = await this.taxService.getIGVRate();

        // 4) Cálculos
        const salePrice = Number((cpp * (1 + profitPct / 100)).toFixed(6));
        const minPrice = Number((cpp * (1 + (profitPct - maxDiscPct) / 100)).toFixed(6));

        const salePriceWithIgv = Number((salePrice * (1 + igvRate / 100)).toFixed(2));
        const minPriceWithIgv = Number((minPrice * (1 + igvRate / 100)).toFixed(2));
        const recommendedPrice = salePriceWithIgv;
        const minAllowedPrice = Number(
            (Math.ceil(recommendedPrice * 0.9 * 100) / 100).toFixed(2),
        );

        return {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            cpp: Number(cpp.toFixed(6)),
            profitMarginPct: profitPct,
            maxDiscountPct: maxDiscPct,
            configScope: scope,
            salePrice,
            minPrice,
            igvRate,
            salePriceWithIgv,
            minPriceWithIgv,
            stockQty,
            recommendedPrice,
            minAllowedPrice,
            costSource,
        };
    }

    /**
     * Validar un descuento aplicado por el vendedor.
     * Devuelve el precio final si el descuento es válido.
     */
    async validateDiscount(productId: number, discountPct: number): Promise<DiscountValidation> {
        const calc = await this.calculatePrice(productId);

        if (discountPct < 0) {
            return {
                isValid: false,
                discountPct,
                maxAllowed: calc.maxDiscountPct,
                finalPrice: calc.salePrice,
                finalPriceWithIgv: calc.salePriceWithIgv,
                message: 'El descuento no puede ser negativo',
            };
        }

        if (discountPct > calc.maxDiscountPct) {
            return {
                isValid: false,
                discountPct,
                maxAllowed: calc.maxDiscountPct,
                finalPrice: calc.salePrice,
                finalPriceWithIgv: calc.salePriceWithIgv,
                message: `No se puede aplicar un descuento mayor al ${calc.maxDiscountPct}%`,
            };
        }

        // Precio con descuento aplicado
        const discountedPrice = Number((calc.salePrice * (1 - discountPct / 100)).toFixed(6));
        const discountedPriceWithIgv = Number((discountedPrice * (1 + calc.igvRate / 100)).toFixed(2));

        return {
            isValid: true,
            discountPct,
            maxAllowed: calc.maxDiscountPct,
            finalPrice: discountedPrice,
            finalPriceWithIgv: discountedPriceWithIgv,
        };
    }

    /**
     * Calcular precios para múltiples productos a la vez.
     */
    async calculatePricesBulk(productIds: number[]): Promise<PriceCalculation[]> {
        const results: PriceCalculation[] = [];
        for (const id of productIds) {
            try {
                results.push(await this.calculatePrice(id));
            } catch {
                // Omitir productos sin configuración
            }
        }
        return results;
    }
}
