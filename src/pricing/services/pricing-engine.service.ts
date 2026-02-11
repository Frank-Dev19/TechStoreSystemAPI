// src/pricing/services/pricing-engine.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    Repository,
    LessThanOrEqual,
    MoreThanOrEqual,
    IsNull,
} from 'typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { PriceList } from '../entities/price-list.entity';
import { DiscountRule } from '../entities/discount-rule.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { ProductPricingQueryDto } from '../dto/product-pricing-query.dto';
import { DiscountType } from '../enums/discount-type.enum';

export interface ProductPriceResult {
    productId: number;
    priceListId: number;
    priceListCode: string;
    currency: string;
    qty: number;
    minQty: number;
    baseUnitPrice: number;
    finalUnitPrice: number;
    autoAppliedDiscounts: DiscountRule[];
    manualDiscountOptions: DiscountRule[];
}

export interface BestPriceOption {
    priceListId: number;
    priceListCode: string;
    currency: string;
    qty: number;
    minQty: number;
    baseUnitPrice: number;
    finalUnitPrice: number;
    autoAppliedDiscounts: DiscountRule[];
    manualDiscountOptions: DiscountRule[];
}

export interface BestPriceResponse {
    productId: number;
    qty: number;
    applied: BestPriceOption;   // la opción que gana
    options: BestPriceOption[]; // todas las opciones evaluadas
}



@Injectable()
export class PricingEngineService {
    constructor(
        @InjectRepository(ProductPrice)
        private readonly ppRepo: Repository<ProductPrice>,
        @InjectRepository(PriceList)
        private readonly plRepo: Repository<PriceList>,
        @InjectRepository(DiscountRule)
        private readonly drRepo: Repository<DiscountRule>,
        @InjectRepository(Product)
        private readonly prodRepo: Repository<Product>,
    ) { }

    private async resolvePriceList(
        code?: string,
        at?: Date,
    ): Promise<PriceList> {
        //const now = at ?? new Date();

        if (code) {
            // 1. Buscar lista activa con el código especificado
            const pl = await this.plRepo.findOne({
                where: {
                    code,
                    isActive: true, // ✅ Solo listas activas
                },
            });

            if (!pl) {
                // 2. Verificar si existe pero está inactiva para dar mensaje más específico
                const inactivePl = await this.plRepo.findOne({
                    where: { code, isActive: false },
                });

                if (inactivePl) {
                    throw new BadRequestException(
                        `Lista de precios "${code}" está inactiva. Actívela para usarla.`,
                    );
                } else {
                    throw new BadRequestException(
                        `Lista de precios "${code}" no encontrada`,
                    );
                }
            }

            // ✅ Lista encontrada y activa
            return pl;
        }

        // 3. Buscar lista por defecto (solo activa)
        const pl = await this.plRepo.findOne({
            where: {
                isDefault: true,
                isActive: true // ✅ Solo lista por defecto activa
            },
        });

        if (!pl) {
            // 4. Verificar si hay lista por defecto pero inactiva
            const inactiveDefaultPl = await this.plRepo.findOne({
                where: { isDefault: true, isActive: false },
            });

            if (inactiveDefaultPl) {
                throw new BadRequestException(
                    'La lista de precios por defecto está configurada pero INACTIVA. Actívela o configure otra lista como predeterminada.',
                );
            } else {
                throw new BadRequestException(
                    'No hay lista de precios por defecto configurada',
                );
            }
        }

        return pl;
    }

    private pickPriceRow(
        rows: ProductPrice[],
        qty: number,
    ): ProductPrice | null {
        const candidates = rows.filter((r) => {
            const minOk = qty >= Number(r.minQty || 0);
            const maxOk =
                r.maxQty == null ? true : qty <= Number(r.maxQty || 0);
            return minOk && maxOk;
        });

        if (!candidates.length) return null;

        candidates.sort(
            (a, b) => Number(b.minQty || 0) - Number(a.minQty || 0),
        );
        return candidates[0];
    }

    private async loadDiscountRules(
        productId: number,
        categoryId: number | null,
        priceListId: number,
        qty: number,
        at: Date,
    ): Promise<DiscountRule[]> {

        // NORMALIZAR: Convertir 'at' al final del día en UTC
        const normalizeDateForComparison = (date: Date): Date => {
            // Tomar la fecha y ponerla al final del día en UTC
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            const day = date.getUTCDate();
            return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        };

        const comparisonDate = normalizeDateForComparison(at);

        const qb = this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :a', { a: true })
            .andWhere(
                `(d.startsAt IS NULL OR 
         DATE(d.startsAt) <= DATE(:now))`,
                { now: at },
            )
            .andWhere(
                `(d.endsAt IS NULL OR 
         DATE(d.endsAt) >= DATE(:now))`,
                { now: at },
            )
            .andWhere(
                '(d.priceListId IS NULL OR d.priceListId = :plId)',
                { plId: priceListId },
            )
            .andWhere(
                '(d.productId IS NULL OR d.productId = :pId OR d.categoryId = :cId)',
                { pId: productId, cId: categoryId ?? null },
            );

        const rules = await qb.getMany();

        return rules.filter((r) => {
            const minOk = r.minQty == null || qty >= Number(r.minQty || 0);
            const maxOk = r.maxQty == null || qty <= Number(r.maxQty || 0);
            return minOk && maxOk;
        });
    }

    async getProductPrice(
        query: ProductPricingQueryDto,
    ): Promise<ProductPriceResult> {
        const product = await this.prodRepo.findOne({
            where: { id: query.product_id },
            relations: ['category'],
        });
        if (!product) {
            throw new BadRequestException('Producto no encontrado');
        }

        const at = query.date ? new Date(query.date) : new Date();
        const pl = await this.resolvePriceList(
            query.price_list_code,
            at,
        );

        const ppRows = await this.ppRepo.find({
            where: {
                productId: product.id,
                priceListId: pl.id,
                isActive: true,
            },
        });

        if (!ppRows.length) {
            throw new BadRequestException(
                'No hay precios configurados para este producto en la lista seleccionada',
            );
        }

        const row = this.pickPriceRow(ppRows, query.qty);
        if (!row) {
            throw new BadRequestException(
                'No hay precio aplicable para la cantidad indicada',
            );
        }

        const basePrice = Number(row.unitPrice);
        let finalPrice = basePrice;

        const rules = await this.loadDiscountRules(
            product.id,
            product.categoryId ?? null,
            pl.id,
            query.qty,
            at,
        );

        const userPerms = new Set(query.user_permissions ?? []);

        const autoApplied: DiscountRule[] = [];
        const manualOptions: DiscountRule[] = [];

        for (const r of rules) {
            const needsPerm = !!r.requiresPermission;
            const hasPerm = r.requiresPermission
                ? userPerms.has(r.requiresPermission)
                : true;

            if (r.autoApply && (!needsPerm || hasPerm)) {
                autoApplied.push(r);
            } else {
                manualOptions.push(r);
            }
        }

        let discountTotalPerUnit = 0;

        for (const r of autoApplied) {
            if (r.discountType === DiscountType.PERCENT) {
                discountTotalPerUnit +=
                    (basePrice * Number(r.amount)) / 100;
            } else if (r.discountType === DiscountType.FIXED) {
                discountTotalPerUnit += Number(r.amount);
            }
        }

        finalPrice = basePrice - discountTotalPerUnit;
        if (finalPrice < 0) finalPrice = 0;

        return {
            productId: product.id,
            priceListId: pl.id,
            priceListCode: pl.code,
            currency: row.currencyCode,
            qty: query.qty,
            minQty: row.minQty,
            baseUnitPrice: basePrice,
            finalUnitPrice: finalPrice,
            autoAppliedDiscounts: autoApplied,
            manualDiscountOptions: manualOptions,
        };
    }


    async getBestPriceForQty(input: {
        product_id: number;
        qty: number;
        date?: string;
        user_permissions?: string[];
    }): Promise<BestPriceResponse> {
        const { product_id, qty, date, user_permissions } = input;

        if (!qty || Number.isNaN(qty) || qty <= 0) {
            throw new BadRequestException('qty debe ser un número mayor a 0');
        }

        // 1) Obtener desde BD las listas que quieres considerar
        //    A) todas las activas:
        const priceLists = await this.plRepo.find({
            where: { isActive: true },
        });

        //    Si SOLO quieres retail y mayorista, usa el tipo:
        /*
        const priceLists = await this.plRepo.find({
          where: {
            isActive: true,
            type: In([PriceListType.RETAIL, PriceListType.WHOLESALE]),
          },
        });
        */

        if (!priceLists.length) {
            throw new BadRequestException(
                'No hay listas de precios activas configuradas',
            );
        }

        const options: BestPriceOption[] = [];

        // 2) Recorrer las listas usando su code real (POR-MENOR, POR-MAYOR, etc.)
        for (const pl of priceLists) {
            try {
                const r = await this.getProductPrice({
                    product_id,
                    qty,
                    price_list_code: pl.code,
                    date,
                    user_permissions,
                });

                options.push({
                    priceListId: r.priceListId,
                    priceListCode: r.priceListCode,
                    currency: r.currency,
                    qty: r.qty,
                    minQty: r.minQty,
                    baseUnitPrice: r.baseUnitPrice,
                    finalUnitPrice: r.finalUnitPrice,
                    autoAppliedDiscounts: r.autoAppliedDiscounts,
                    manualDiscountOptions: r.manualDiscountOptions,
                });
            } catch (e) {
                if (!(e instanceof BadRequestException)) {
                    throw e;
                }
                // si es BadRequest (no hay precio para esa lista), se ignora
            }
        }

        if (!options.length) {
            throw new BadRequestException(
                'No hay precios configurados para esta cantidad',
            );
        }

        const applied = options.reduce((best, cur) =>
            cur.finalUnitPrice < best.finalUnitPrice ? cur : best,
        );

        return {
            productId: product_id,
            qty,
            applied,
            options,
        };
    }


}
