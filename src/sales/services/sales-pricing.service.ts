// src/sales/services/sales-pricing.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingEngineService, PriceCalculation } from 'src/pricing/services/pricing-engine.service';
import { Product } from 'src/inventory/entities/product.entity';

export interface ProductPricingResult {
    productId: number;
    productName: string;
    sku: string;
    quantity: number;

    // Precios por unidad (sin IGV)
    baseUnitPrice: number;      // Precio de venta calculado (CPP × (1 + utilidad%))
    finalUnitPrice: number;     // Precio con descuento aplicado
    unitDiscount: number;       // Descuento por unidad

    // Totales (sin IGV)
    baseSubtotal: number;       // baseUnitPrice × quantity
    finalSubtotal: number;      // finalUnitPrice × quantity
    totalDiscount: number;      // unitDiscount × quantity

    // IGV
    igvRate: number;
    igvAmount: number;          // IGV sobre el finalSubtotal
    totalWithIgv: number;       // finalSubtotal + igvAmount

    // Info de márgenes
    cpp: number;
    profitMarginPct: number;
    maxDiscountPct: number;
    appliedDiscountPct: number;

    // Descuentos (simplificado — ya no hay reglas complejas)
    discounts: Array<{
        name: string;
        type: string;
        amount: number;
        value: number;
        source: string;
        priority: number;
    }>;

    availableCombos: Array<any>; // Mantenemos la interface pero siempre vacío
}

@Injectable()
export class SalesPricingService {
    constructor(
        private readonly pricingEngine: PricingEngineService,
        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
    ) {}

    async getProductPricing(params: {
        productId: number;
        quantity: number;
        discountPct?: number;
    }): Promise<ProductPricingResult> {
        const product = await this.productRepo.findOne({
            where: { id: params.productId },
        });

        if (!product) {
            throw new BadRequestException(`Producto con ID ${params.productId} no encontrado`);
        }

        // Calcular precio con el nuevo motor
        const calc = await this.pricingEngine.calculatePrice(params.productId);

        // Aplicar descuento si se proporcionó
        const discountPct = params.discountPct ?? 0;

        if (discountPct > calc.maxDiscountPct) {
            throw new BadRequestException(
                `No se puede aplicar un descuento mayor al ${calc.maxDiscountPct}%`,
            );
        }

        const baseUnitPrice = calc.salePrice;
        const finalUnitPrice = Number((baseUnitPrice * (1 - discountPct / 100)).toFixed(6));
        const unitDiscount = Number((baseUnitPrice - finalUnitPrice).toFixed(6));

        const baseSubtotal = Number((baseUnitPrice * params.quantity).toFixed(2));
        const finalSubtotal = Number((finalUnitPrice * params.quantity).toFixed(2));
        const totalDiscount = Number((unitDiscount * params.quantity).toFixed(2));

        const igvRate = calc.igvRate;
        const igvAmount = Number((finalSubtotal * igvRate / 100).toFixed(2));
        const totalWithIgv = Number((finalSubtotal + igvAmount).toFixed(2));

        const discounts: ProductPricingResult['discounts'] = [];
        if (discountPct > 0) {
            discounts.push({
                name: `Rebaja del vendedor (${discountPct}%)`,
                type: 'PERCENT',
                amount: discountPct,
                value: unitDiscount,
                source: 'SELLER_DISCOUNT',
                priority: 1,
            });
        }

        return {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: params.quantity,
            baseUnitPrice,
            finalUnitPrice,
            unitDiscount,
            baseSubtotal,
            finalSubtotal,
            totalDiscount,
            igvRate,
            igvAmount,
            totalWithIgv,
            cpp: calc.cpp,
            profitMarginPct: calc.profitMarginPct,
            maxDiscountPct: calc.maxDiscountPct,
            appliedDiscountPct: discountPct,
            discounts,
            availableCombos: [],
        };
    }
}