import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Stock } from '../entities/stock.entity';
import { Product } from '../entities/product.entity';
import { Lot } from '../entities/lot.entity';

@Injectable()
export class StockService {
    constructor(
        @InjectRepository(Stock) private stockRepo: Repository<Stock>,
        @InjectRepository(Product) private prodRepo: Repository<Product>,
        @InjectRepository(Lot) private lotRepo: Repository<Lot>,
    ) { }

    listAll() {
        return this.stockRepo.find({ relations: ['product', 'lot'] });
    }

    async listPaged(filters: any = {}) {
        // Obtenemos todo el stock relacionando el producto y lote
        const qb = this.stockRepo.createQueryBuilder('stock')
            .leftJoinAndSelect('stock.product', 'product')
            .leftJoinAndSelect('stock.lot', 'lot')
            .where('stock.qtyOnHand > 0'); // por defecto solemos mostrar stock real, pero ajustaremos

        if (filters.search) {
            qb.andWhere('(product.name LIKE :search OR product.sku LIKE :search)', { search: `%${filters.search}%` });
        }
        if (filters.category_id) {
            qb.andWhere('product.categoryId = :catId', { catId: filters.category_id });
        }
        if (filters.updated_from) {
            qb.andWhere('stock.updatedAt >= :from', { from: filters.updated_from + ' 00:00:00' });
        }
        if (filters.updated_to) {
            qb.andWhere('stock.updatedAt <= :to', { to: filters.updated_to + ' 23:59:59' });
        }

        if (filters.expiration_status && filters.expiration_status !== 'ALL') {
            const now = new Date();
            const n7 = new Date(); n7.setDate(n7.getDate() + 7);
            const n15 = new Date(); n15.setDate(n15.getDate() + 15);
            const n30 = new Date(); n30.setDate(n30.getDate() + 30);

            if (filters.expiration_status === 'EXPIRED') {
                qb.andWhere('lot.expirationDate < :now', { now });
            } else if (filters.expiration_status === 'NEXT_7') {
                qb.andWhere('lot.expirationDate BETWEEN :now AND :n7', { now, n7 });
            } else if (filters.expiration_status === 'NEXT_15') {
                qb.andWhere('lot.expirationDate BETWEEN :now AND :n15', { now, n15 });
            } else if (filters.expiration_status === 'NEXT_30') {
                qb.andWhere('lot.expirationDate BETWEEN :now AND :n30', { now, n30 });
            }
        }

        const rawData = await qb.getMany();

        // Agrupar (Master-Detail) en Memoria
        // Dado el alcance de este tipo de backend, la agrupación la podemos hacer rápidamente en TS:
        const groups = new Map<number, any>();
        for (const line of rawData) {
            if (!groups.has(line.productId)) {
                groups.set(line.productId, {
                    product: line.product,
                    product_id: line.productId, // para compatibilidad
                    total_qty: 0,
                    total_cost: 0,
                    avg_cost: 0,
                    updated_at: line.updatedAt,
                    lots: []
                });
            }
            const g = groups.get(line.productId);
            g.total_qty += Number(line.qtyOnHand);
            g.total_cost += Number(line.totalCost);

            // actualizamos updated_at a la fecha mas reciente reportada
            if (new Date(line.updatedAt) > new Date(g.updated_at)) {
                g.updated_at = line.updatedAt;
            }

            g.lots.push({
                stock_id: line.id,
                lot_id: line.lotId,
                lot: line.lot,
                qty_on_hand: Number(line.qtyOnHand),
                avg_unit_cost: Number(line.avgUnitCost),
                total_cost: Number(line.totalCost)
            });
        }

        let aggregatedArray = Array.from(groups.values()).map(g => {
            if (g.total_qty > 0) {
                g.avg_cost = g.total_cost / g.total_qty;
            }
            return g;
        });

        if (filters.low_stock === 'true') {
            aggregatedArray = aggregatedArray.filter(g => {
                const min = g.product ? Number(g.product.reorderPoint || 0) : 0;
                return g.total_qty <= min;
            });
        }

        // Paginación en TS ya que la tabla se colapsó y agrupó:
        const page = filters.page ? Number(filters.page) : 1;
        const limit = filters.limit ? Number(filters.limit) : 20;
        const skip = (page - 1) * limit;

        const paginatedData = aggregatedArray.slice(skip, skip + limit);

        return {
            data: paginatedData,
            total: aggregatedArray.length,
            page,
            limit
        };
    }

    async getMetrics(filters: any = {}) {
        const qb = this.stockRepo.createQueryBuilder('stock')
            .leftJoinAndSelect('stock.product', 'product')
            .leftJoinAndSelect('stock.lot', 'lot');

        if (filters.search) {
            qb.andWhere('(product.name LIKE :search OR product.sku LIKE :search)', { search: `%${filters.search}%` });
        }
        if (filters.category_id) {
            qb.andWhere('product.categoryId = :catId', { catId: filters.category_id });
        }
        if (filters.updated_from) {
            qb.andWhere('stock.updatedAt >= :from', { from: filters.updated_from + ' 00:00:00' });
        }
        if (filters.updated_to) {
            qb.andWhere('stock.updatedAt <= :to', { to: filters.updated_to + ' 23:59:59' });
        }

        if (filters.expiration_status && filters.expiration_status !== 'ALL') {
            const now = new Date();
            const n7 = new Date(); n7.setDate(n7.getDate() + 7);
            const n15 = new Date(); n15.setDate(n15.getDate() + 15);
            const n30 = new Date(); n30.setDate(n30.getDate() + 30);

            if (filters.expiration_status === 'EXPIRED') {
                qb.andWhere('lot.expirationDate < :now', { now });
            } else if (filters.expiration_status === 'NEXT_7') {
                qb.andWhere('lot.expirationDate BETWEEN :now AND :n7', { now, n7 });
            } else if (filters.expiration_status === 'NEXT_15') {
                qb.andWhere('lot.expirationDate BETWEEN :now AND :n15', { now, n15 });
            } else if (filters.expiration_status === 'NEXT_30') {
                qb.andWhere('lot.expirationDate BETWEEN :now AND :n30', { now, n30 });
            }
        }

        const stockData = await qb.getMany();

        // 1. Valorizado Total
        const totalValue = stockData.reduce((sum, s) => sum + Number(s.totalCost), 0);

        // 2. Productos únicos con stock > 0
        const productsInStock = new Set<number>();
        // 3. Productos con bajo stock (menor al reorder point)
        const aggregatedStock = new Map<number, { qty: number, minStock: number }>();
        // 4. Lotes vencidos o por vencer (< 30 días)
        let expiringLotsCount = 0;

        const now = new Date();
        const next30 = new Date();
        next30.setDate(now.getDate() + 30);

        for (const s of stockData) {
            const qty = Number(s.qtyOnHand);
            if (qty > 0) {
                productsInStock.add(s.productId);
            }

            if (!aggregatedStock.has(s.productId)) {
                aggregatedStock.set(s.productId, {
                    qty: 0,
                    minStock: Number(s.product?.reorderPoint || 0)
                });
            }
            aggregatedStock.get(s.productId)!.qty += qty;

            if (s.lot && s.lot.expirationDate) {
                if (qty > 0) {
                    const exp = new Date(s.lot.expirationDate);
                    if (exp <= next30) {
                        expiringLotsCount++;
                    }
                }
            }
        }

        let lowStockCount = 0;
        for (const [pid, data] of aggregatedStock.entries()) {
            if (data.qty < data.minStock) {
                lowStockCount++;
            }
        }

        return {
            totalValue,
            productsInStock: productsInStock.size,
            lowStockCount,
            expiringLotsCount
        };
    }
}
