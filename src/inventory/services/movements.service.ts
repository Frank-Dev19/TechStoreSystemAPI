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

            // --- NEW: Pre-procesamiento de seriales ---
            let serialsToLink: Serial[] = [];

            if (product.isSerialized) {
                if (dto.type === 'IN' || (dto.type === 'ADJ' && dto.qty > 0)) {
                    const codes = (dto.serial_codes ?? []).map(c => c.trim()).filter(Boolean);
                    // Verifica que los códigos no existan
                    const existing = await em.getRepository(Serial).find({ where: { serialCode: In(codes) } });
                    if (existing.length) {
                        const dup = existing.map(s => s.serialCode).join(', ');
                        throw new BadRequestException(`Serial(es) ya existentes: ${dup}`);
                    }
                    // Crear seriales en IN_STOCK (asociar a producto y lote si aplica)
                    const toCreate = codes.map(code => em.getRepository(Serial).create({
                        productId: product.id,
                        serialCode: code,
                        lotId: lotId ?? null,
                        status: 'IN_STOCK',
                    }));
                    serialsToLink = await em.getRepository(Serial).save(toCreate);

                } else if (dto.type === 'OUT' || (dto.type === 'ADJ' && dto.qty < 0)) {
                    const ids = dto.serial_ids ?? [];
                    serialsToLink = await em.getRepository(Serial).find({ where: { id: In(ids), productId: product.id } });
                    if (serialsToLink.length !== ids.length) {
                        throw new BadRequestException('Alguno(s) serial(es) no existen o no corresponden al producto');
                    }
                    // Validar estado disponible
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

    async listKardex(filters: { product_id?: number; reason_code?: string; date_from?: string; date_to?: string; }) {
        const qb = this.movRepo.createQueryBuilder('m').orderBy('m.occurredAt', 'DESC');
        if (filters.product_id) qb.andWhere('m.productId = :p', { p: filters.product_id });
        if (filters.reason_code) qb.andWhere('m.reasonCode = :r', { r: filters.reason_code });
        if (filters.date_from) qb.andWhere('m.occurredAt >= :df', { df: filters.date_from });
        if (filters.date_to) qb.andWhere('m.occurredAt <= :dt', { dt: filters.date_to });
        return qb.getMany();
    }
}
