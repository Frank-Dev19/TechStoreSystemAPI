import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository, IsNull, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Movement, MovementType } from '../entities/movement.entity';
import { Product } from '../entities/product.entity';
import { Stock } from '../entities/stock.entity';
import { Lot } from '../entities/lot.entity';
import { Serial } from '../entities/serial.entity';
import { MovementDto } from '../dto/movement.dto';
import { MovementSerial } from '../entities/movement-serial.entity';

@Injectable()
export class MovementsService {
    constructor(
        private readonly ds: DataSource,
        @InjectRepository(Movement) private movRepo: Repository<Movement>,
        @InjectRepository(Product) private prodRepo: Repository<Product>,
        @InjectRepository(Stock) private stockRepo: Repository<Stock>,
        @InjectRepository(Lot) private lotRepo: Repository<Lot>,
        @InjectRepository(Serial) private serialRepo: Repository<Serial>,
        @InjectRepository(MovementSerial) private movSerRepo: Repository<MovementSerial>,
    ) { }

    async createMovement(dto: MovementDto, user: string = 'API') {
        if (dto.type === 'ADJ' && Number(dto.qty) === 0) {
            throw new BadRequestException('El ajuste no puede ser 0');
        }
        const product = await this.prodRepo.findOneBy({ id: dto.product_id });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const qtyAbs = Math.abs(Number(dto.qty));
        const isAdjNeg = dto.type === 'ADJ' && Number(dto.qty) < 0;

        // Validaciones por tipo
        if (product.managesExpiration && !dto.lot_id && dto.type !== 'ADJ') {
            throw new BadRequestException('Debe indicar lot_id para producto con vencimiento');
        }

        // --- NEW: Validación seriales por tipo ---
        if (product.isSerialized) {
            if (dto.type === 'IN' || (dto.type === 'ADJ' && dto.qty > 0)) {
                if (!dto.serial_codes || dto.serial_codes.length !== qtyAbs) {
                    throw new BadRequestException(`Debe enviar serial_codes con cantidad exacta (${qtyAbs})`);
                }
            }
            if (dto.type === 'OUT' || (dto.type === 'ADJ' && dto.qty < 0)) {
                if (!dto.serial_ids || dto.serial_ids.length !== qtyAbs) {
                    throw new BadRequestException(`Debe enviar serial_ids con cantidad exacta (${qtyAbs})`);
                }
            }
        }

        return this.ds.transaction(async (em) => {
            let lotId: number | null = dto.lot_id ?? null;
            if (dto.type === 'IN' && product.managesExpiration && !lotId) {
                throw new BadRequestException('Entrada de producto con vencimiento requiere lote existente');
            }

            // CPP global
            const prodStocks = await em.getRepository(Stock).find({ where: { productId: product.id } });
            const totalQty = prodStocks.reduce((a, s) => a + Number(s.qtyOnHand), 0);
            const totalCost = prodStocks.reduce((a, s) => a + Number(s.totalCost), 0);
            const cpp = totalQty > 0 ? totalCost / totalQty : 0;

            let unitCost = dto.unit_cost ?? cpp;
            if (dto.type === 'IN' && dto.unit_cost == null) {
                throw new BadRequestException('Entrada requiere unit_cost');
            }

            // Salida: no permitir negativo global
            if ((dto.type === 'OUT' || isAdjNeg) && totalQty < qtyAbs) {
                throw new BadRequestException(`Stock insuficiente. Disponible: ${totalQty}`);
            }

            // Línea de stock por (productId, lotId)
            const where: any = { productId: product.id };
            where.lotId = (lotId == null) ? IsNull() : lotId;

            let stockLine = await em.getRepository(Stock).findOne({ where });
            if (!stockLine) {
                stockLine = em.getRepository(Stock).create({
                    productId: product.id,
                    lotId,
                    qtyOnHand: 0,
                    avgUnitCost: 0,
                    totalCost: 0,
                });
            }

            // --- NEW: Pre-procesamiento de seriales (con reactivación) ---
            let serialsToLink: Serial[] = [];

            if (product.isSerialized) {
                if (dto.type === 'IN' || (dto.type === 'ADJ' && dto.qty > 0)) {
                    const codes = (dto.serial_codes ?? []).map(c => c.trim()).filter(Boolean);
                    if (!codes.length) {
                        throw new BadRequestException(`Debe enviar serial_codes con cantidad exacta (${Math.abs(Number(dto.qty))})`);
                    }

                    const serialRepo = em.getRepository(Serial);
                    const existing = await serialRepo.find({ where: { serialCode: In(codes) } });

                    // 1) No permitir seriales existentes de OTRO producto
                    const existingOtherProduct = existing
                        .filter(s => s.productId !== product.id)
                        .map(s => s.serialCode);
                    if (existingOtherProduct.length) {
                        throw new BadRequestException(`Serial(es) pertenecen a otro producto: ${existingOtherProduct.join(', ')}`);
                    }

                    // 2) No permitir duplicados ya en stock
                    const existingInStock = existing
                        .filter(s => s.productId === product.id && s.status === 'IN_STOCK')
                        .map(s => s.serialCode);
                    if (existingInStock.length) {
                        throw new BadRequestException(`Serial(es) ya en stock: ${existingInStock.join(', ')}`);
                    }

                    // 3) Reactivar los que existan con estado ISSUED (vuelven a IN_STOCK)
                    const toReactivate = existing.filter(s => s.productId === product.id && s.status === 'ISSUED');

                    for (const s of toReactivate) {
                        s.status = 'IN_STOCK';
                        // si te mandan un lote para el ajuste/entrada, úsalo; si no, conserva el anterior
                        s.lotId = (dto.lot_id ?? null) ?? s.lotId ?? null;
                    }
                    const reactivated = toReactivate.length ? await serialRepo.save(toReactivate) : [];

                    // 4) Crear los que NO existan todavía
                    const existingCodes = new Set(existing.map(s => s.serialCode));
                    const newCodes = codes.filter(code => !existingCodes.has(code));

                    const toCreate = newCodes.map(code => serialRepo.create({
                        productId: product.id,
                        serialCode: code,
                        lotId: dto.lot_id ?? null,
                        status: 'IN_STOCK',
                    }));
                    const created = toCreate.length ? await serialRepo.save(toCreate) : [];

                    serialsToLink = [...reactivated, ...created];

                } else if (dto.type === 'OUT' || (dto.type === 'ADJ' && dto.qty < 0)) {
                    const ids = dto.serial_ids ?? [];
                    serialsToLink = await em.getRepository(Serial).find({ where: { id: In(ids), productId: product.id } });
                    if (serialsToLink.length !== ids.length) {
                        throw new BadRequestException('Alguno(s) serial(es) no existen o no corresponden al producto');
                    }
                    // Deben estar disponibles para salir
                    const notAvail = serialsToLink.filter(s => s.status !== 'IN_STOCK');
                    if (notAvail.length) {
                        const codes = notAvail.map(s => s.serialCode).join(', ');
                        throw new BadRequestException(`Serial(es) no disponible(s): ${codes}`);
                    }
                }
            }


            // Efectos en stock
            const qty = qtyAbs;
            if (dto.type === 'IN') {
                stockLine.qtyOnHand = Number(stockLine.qtyOnHand) + qty;
                stockLine.totalCost = Number(stockLine.totalCost) + (qty * unitCost);
                stockLine.avgUnitCost = stockLine.qtyOnHand > 0 ? Number(stockLine.totalCost) / Number(stockLine.qtyOnHand) : 0;
            } else if (dto.type === 'OUT') {
                unitCost = cpp;
                stockLine.qtyOnHand = Number(stockLine.qtyOnHand) - qty;
                stockLine.totalCost = Number(stockLine.totalCost) - (qty * unitCost);
                stockLine.avgUnitCost = stockLine.qtyOnHand > 0 ? Number(stockLine.totalCost) / Number(stockLine.qtyOnHand) : 0;
            } else if (dto.type === 'ADJ') {
                const sign = dto.qty >= 0 ? +1 : -1;
                const cost = unitCost ?? stockLine.avgUnitCost ?? cpp;
                stockLine.qtyOnHand = Number(stockLine.qtyOnHand) + (sign * qty);
                stockLine.totalCost = Number(stockLine.totalCost) + (sign * qty * cost);
                stockLine.avgUnitCost = stockLine.qtyOnHand > 0 ? Number(stockLine.totalCost) / Number(stockLine.qtyOnHand) : 0;
                if (stockLine.qtyOnHand < 0) throw new BadRequestException('El ajuste resultaría en stock negativo');
                unitCost = cost;
            }

            await em.getRepository(Stock).save(stockLine);

            // Saldos post
            const postLines = await em.getRepository(Stock).find({ where: { productId: product.id } });
            const postQty = postLines.reduce((a, s) => a + Number(s.qtyOnHand), 0);
            const postCost = postLines.reduce((a, s) => a + Number(s.totalCost), 0);
            const postAvg = postQty > 0 ? postCost / postQty : 0;
            const movementSign = (dto.type === 'OUT' || isAdjNeg) ? -1 : 1;

            const movement = em.getRepository(Movement).create({
                type: dto.type as MovementType,
                productId: product.id,
                lotId,
                serialId: null, // deprecado para múltiples
                qty,
                unitCost,
                totalCost: qty * unitCost * movementSign, // signo visual
                reasonCode: dto.reason_code,
                sourceDocType: dto.source_doc_type ?? null,
                sourceDocId: dto.source_doc_id ?? null,
                notes: dto.notes ?? null,
                userCreated: user,
                occurredAt: new Date(),
                balanceQtyPost: postQty,
                balanceTotalCostPost: postCost,
                balanceAvgCostPost: postAvg,
            });
            const savedMov = await em.getRepository(Movement).save(movement);

            // --- NEW: linkear seriales y actualizar estados ---
            if (product.isSerialized && serialsToLink.length) {
                // OUT / ADJ−: cambiar estado a ISSUED
                if (dto.type === 'OUT' || (dto.type === 'ADJ' && dto.qty < 0)) {
                    for (const s of serialsToLink) {
                        s.status = 'ISSUED';
                        await em.getRepository(Serial).save(s);
                    }
                }
                // IN / ADJ+: ya fueron creados con IN_STOCK

                // Link a movimiento
                const links = serialsToLink.map(s =>
                    em.getRepository(MovementSerial).create({ movementId: savedMov.id, serialId: s.id })
                );
                await em.getRepository(MovementSerial).save(links);
            }

            return savedMov;
        });
    }

    async listKardex(filters: { product_id?: number; reason_code?: string; date_from?: string; date_to?: string; page?: number; limit?: number; }) {
        const qb = this.movRepo.createQueryBuilder('m').orderBy('m.occurredAt', 'DESC');
        if (filters.product_id) qb.andWhere('m.productId = :p', { p: filters.product_id });
        if (filters.reason_code) qb.andWhere('m.reasonCode = :r', { r: filters.reason_code });
        if (filters.date_from) qb.andWhere('m.occurredAt >= :df', { df: filters.date_from + ' 00:00:00' });
        if (filters.date_to) qb.andWhere('m.occurredAt <= :dt', { dt: filters.date_to + ' 23:59:59' });

        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;

        const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

        return {
            data,
            total,
            page,
            limit
        };
    }
}
