// src/pricing/dto/simulation-result.dto.ts
import { DiscountRule } from '../entities/discount-rule.entity';
import { Combo } from '../entities/combo.entity';

export interface AppliedDiscountDetail {
    rule: DiscountRule;
    applied: boolean;
    reason?: string;
    discountAmount?: number;
}

export interface AppliedComboDetail {
    combo: Combo;
    applied: boolean;
    reason?: string;
    savings?: number;
    originalPrice?: number;
    finalPrice?: number;
}

export interface PriceBreakdown {
    basePrice: number;
    quantity: number;
    subtotalBase: number;

    discounts: {
        amount: number;
        percent: number;
        details: AppliedDiscountDetail[];
    };

    combos: {
        applied: AppliedComboDetail[];
        available: AppliedComboDetail[];
    };

    finalPricePerUnit: number;
    finalTotal: number;
}

export interface ValidationIssue {
    type: 'WARNING' | 'ERROR' | 'INFO';
    code: string;
    message: string;
    ruleId?: number;
    comboId?: number;
}

export interface SimulationResult {
    // Información básica
    productId?: number;
    comboId?: number;
    productName?: string;
    comboName?: string;
    quantity: number;
    priceListCode: string;
    simulationDate: Date;

    // Resultados
    priceBreakdown: PriceBreakdown;

    // Validación
    validationIssues: ValidationIssue[];

    // Detalles técnicos
    technicalDetails?: {
        rulesEvaluated: number;
        combosEvaluated: number;
        executionTimeMs: number;
        conditionsSummary: string;
    };

    // Comparación
    comparison?: {
        withPermissions: number;
        withoutPermissions: number;
        differentDate: number;
        differentQuantity: number;
    };
}