import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository, IsNull, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Count } from '../entities/count.entity';
import { CountSnapshot } from '../entities/count-snapshot.entity';
import { CountEntry } from '../entities/count-entry.entity';
import { Stock } from '../entities/stock.entity';
import { Movement } from '../entities/movement.entity';
import { CountEntrySerial } from '../entities/count-entry-serial.entity';
import { MovementsService } from './movements.service';
import { Product } from '../entities/product.entity';
import { Serial } from '../entities/serial.entity';
import { MovementTypeEnum } from '../dto/movement.dto';
import { CountDifference } from '../entities/count-difference.entity';
import { CountDifferenceSummary } from '../entities/count-difference-summary.entity';

@Injectable()
export class CountsService {
    constructor(
        private readonly ds: DataSource,
        @InjectRepository(Count) private countRepo: Repository<Count>,
        @InjectRepository(CountSnapshot) private snapRepo: Repository<CountSnapshot>,
        @InjectRepository(CountEntry) private entryRepo: Repository<CountEntry>,
        @InjectRepository(Stock) private stockRepo: Repository<Stock>,
        @InjectRepository(Movement) private movRepo: Repository<Movement>,
        @InjectRepository(Serial) private serialRepo: Repository<Serial>,                     // NEW
        @InjectRepository(CountEntrySerial) private cesRepo: Repository<CountEntrySerial>,   // NEW
        @InjectRepository(Product) private prodRepo: Repository<Product>,                    // NEW
        @InjectRepository(CountDifference) private diffRepo: Repository<CountDifference>,
        @InjectRepository(CountDifferenceSummary) private diffSumRepo: Repository<CountDifferenceSummary>,

        private readonly movementsSvc: MovementsService,
    ) { }

    create(dto: { code?: string; description?: string }, user) {
        const code = dto.code ?? this.nextCode();
        const c = this.countRepo.create({ code, description: dto.description ?? null, status: 'DRAFT', createdBy: user });
        return this.countRepo.save(c);
    }

    list() { return this.countRepo.find({ order: { createdAt: 'DESC' } }); }
    get(id: number) { return this.countRepo.findOneBy({ id }); }

    async freeze(id: number) {
        const count = await this.get(id);
        if (!count) throw new NotFoundException('Conteo no encontrado');
        if (count.status !== 'DRAFT') throw new BadRequestException('Solo se congela desde DRAFT');

        // regenerar snapshots
        await this.ds.transaction(async (em) => {
            await em.getRepository(CountSnapshot).delete({ countId: id });
            const lines = await em.getRepository(Stock).find();
            const snaps = lines.map((s) =>
                em.getRepository(CountSnapshot).create({
                    countId: id, productId: s.productId, lotId: s.lotId ?? null,
                    qtySystem: Number(s.qtyOnHand),
                    avgCostAtFreeze: Number(s.avgUnitCost),
                    totalCostAtFreeze: Number(s.totalCost),
                    snapshotDate: new Date(),
                }),
            );
            await em.getRepository(CountSnapshot).save(snaps);
            count.status = 'FROZEN';
            count.frozenAt = new Date();
            await em.getRepository(Count).save(count);
        });

        return this.get(id);
    }

    async startCounting(id: number) {
        const count = await this.get(id);
        if (!count || count.status !== 'FROZEN') throw new BadRequestException('Debe estar FROZEN');
        count.status = 'COUNTING';
        return this.countRepo.save(count);
    }

    async addEntry(
        id: number,
        entry: { product_id: number; lot_id?: number | null; qty_counted: number; user?: string; serial_codes?: string[] }
    ) {
        const count = await this.get(id);
        if (!count || count.status !== 'COUNTING') throw new BadRequestException('Conteo no está en COUNTING');

        const product = await this.prodRepo.findOneBy({ id: entry.product_id });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const lotId = entry.lot_id ?? null;
        const qtyToAdd = Number(entry.qty_counted || 0);

        // 1) buscar si ya existe la fila (countId, productId, lotId)

        // construir el where respetando null
        const where: any = {
            countId: id,
            productId: entry.product_id,
            lotId: lotId == null ? IsNull() : lotId,
        };

        // 👇 ya no marca error
        let saved = await this.entryRepo.findOne({ where });

        //   let saved = await this.entryRepo.findOne({
        //     where: { countId: id, productId: entry.product_id, lotId },
        //   });

        if (saved) {
            // fusionar cantidades
            saved.qtyCounted = Number(saved.qtyCounted || 0) + qtyToAdd;
            saved.countedBy = entry.user ?? saved.countedBy ?? 'API';
            saved = await this.entryRepo.save(saved);
        } else {
            // crear nueva
            const ce = this.entryRepo.create({
                countId: id,
                productId: entry.product_id,
                lotId,
                qtyCounted: qtyToAdd,
                countedBy: entry.user ?? 'API',
            });
            saved = await this.entryRepo.save(ce);
        }

        // 2) si es serializado, registrar seriales (evitando duplicados)
        if (product.isSerialized) {
            const codes = (entry.serial_codes ?? [])
                .map(c => String(c).trim())
                .filter(Boolean);

            if (qtyToAdd > 0 && codes.length !== qtyToAdd) {
                throw new BadRequestException(`Debe enviar ${qtyToAdd} serial(es)`);
            }

            if (codes.length) {
                // cargar existentes para este entry
                const existing = await this.cesRepo.find({
                    where: { entryId: saved.id },
                });
                const already = new Set(existing.map(x => x.serialCode.trim()));

                const rows = codes
                    .filter(code => !already.has(code))
                    .map(code =>
                        this.cesRepo.create({
                            entryId: saved.id,
                            serialCode: code,
                            lotId,
                            productId: entry.product_id,
                        })
                    );

                if (rows.length) await this.cesRepo.save(rows);
            }
        }

        return saved;
    }


    // counts.service.ts
    async addEntries(
        id: number,
        entries: Array<{ product_id: number; lot_id?: number | null; qty_counted: number; user?: string }>,
        user = 'API',
    ) {
        const count = await this.get(id);
        if (!count || count.status !== 'COUNTING') {
            throw new BadRequestException('Conteo no está en COUNTING');
        }

        // normaliza
        const rows = entries.map(e => ({
            countId: id,
            productId: e.product_id,
            lotId: e.lot_id ?? null,
            qtyCounted: Number(e.qty_counted),
            countedBy: e.user ?? user,
            countedAt: new Date(),
        }));

        return this.ds.transaction(async em => {
            // upsert por (countId, productId, lotId): crea o reemplaza qtyCounted
            await em.getRepository(CountEntry).upsert(rows, ['countId', 'productId', 'lotId']);
            return { addedOrUpdated: rows.length };
        });
    }



    // ====== NUEVO: recalcular y persistir diferencias ======
    private async recomputeAndPersistDifferences(id: number, user = 'API') {
        return this.ds.transaction(async (em) => {
            const snaps = await em.getRepository(CountSnapshot).find({ where: { countId: id } });
            const entries = await em.getRepository(CountEntry).find({ where: { countId: id } });

            // Mapa (productId,lotId) -> qtyCounted
            const key = (p: number, l: number | null) => `${p}:${l ?? 'null'}`;
            const countedMap = new Map<string, number>();
            for (const e of entries) countedMap.set(key(e.productId, e.lotId ?? null), Number(e.qtyCounted || 0));

            // borrar anteriores
            await em.getRepository(CountDifference).delete({ countId: id });

            const diffs: CountDifference[] = [];
            let surplus = 0, shortage = 0;

            for (const s of snaps) {
                const counted = countedMap.get(key(s.productId, s.lotId ?? null)) ?? 0;
                const qtySys = Number(s.qtySystem);
                const diff = counted - qtySys;
                if (diff === 0) continue;

                const avg = Number(s.avgCostAtFreeze);
                const val = diff * avg;

                const row = em.getRepository(CountDifference).create({
                    countId: id,
                    productId: s.productId,
                    lotId: s.lotId ?? null,
                    qtySystem: qtySys,
                    qtyCounted: counted,
                    difference: diff,
                    avgCostAtFreeze: avg,
                    valueDifference: val,
                    calculatedBy: user,
                });
                diffs.push(row);

                if (val > 0) surplus += val;
                else shortage += Math.abs(val);
            }

            if (diffs.length) await em.getRepository(CountDifference).save(diffs);

            // Upsert del resumen
            const existing = await em.getRepository(CountDifferenceSummary).findOne({ where: { countId: id } });
            const summary = existing
                ? Object.assign(existing, {
                    surplusValue: surplus,
                    shortageValue: shortage,
                    netValue: surplus - shortage,
                    calculatedBy: user,
                })
                : em.getRepository(CountDifferenceSummary).create({
                    countId: id,
                    surplusValue: surplus,
                    shortageValue: shortage,
                    netValue: surplus - shortage,
                    calculatedBy: user,
                });
            await em.getRepository(CountDifferenceSummary).save(summary);
        });
    }

    // ====== NUEVO: exponer diferencias/summary ======
    async listDifferences(id: number) {
        const count = await this.get(id);
        if (!count) throw new NotFoundException('Conteo no encontrado');
        // Permitimos leer en REVIEW (y COUNTING si quisieras mostrar “live”)
        if (count.status !== 'REVIEW' && count.status !== 'COUNTING') {
            throw new BadRequestException('Disponible en COUNTING o REVIEW');
        }
        return this.diffRepo.find({
            where: { countId: id },
            order: { productId: 'ASC', lotId: 'ASC' as any },
        });
    }

    async getDifferencesSummary(id: number) {
        return this.diffSumRepo.findOne({ where: { countId: id } });
    }

    async review(id: number, user = 'API') {
        const count = await this.get(id);
        if (!count || count.status !== 'COUNTING') throw new BadRequestException('Debe estar en COUNTING');

        // 1) Cambiar estado
        count.status = 'REVIEW';
        await this.countRepo.save(count);

        // 2) Calcular y persistir diferencias (detalle + resumen)
        await this.recomputeAndPersistDifferences(id, user);

        return this.get(id);
    }

    async post(id: number, user = 'API') {
        const count = await this.get(id);
        if (!count || count.status !== 'REVIEW') throw new BadRequestException('Debe estar en REVIEW');

        await this.ds.transaction(async (em) => {
            const snaps = await em.getRepository(CountSnapshot).find({ where: { countId: id } });

            // Pre-cargar: entradas + seriales por count
            const entries = await em.getRepository(CountEntry).find({ where: { countId: id } });
            const entryIds = entries.map(e => e.id);
            const ces = entryIds.length
                ? await em.getRepository(CountEntrySerial).find({ where: { entryId: In(entryIds) } })
                : [];

            // Pre-cargar products para saber si es serializable
            const prodIds = Array.from(new Set(snaps.map(s => s.productId)));
            const products = await em.getRepository(Product).find({ where: { id: In(prodIds) } });
            const isSerialized = (pid: number) => products.find(p => p.id === pid)?.isSerialized ?? false;

            for (const s of snaps) {
                const e = entries.find(x => x.productId === s.productId && (x.lotId ?? null) === (s.lotId ?? null));
                const countedQty = Number(e?.qtyCounted ?? 0);

                if (!isSerialized(s.productId)) {
                    // === Caso NO serializado: misma lógica actual (por cantidad) ===
                    const diff = countedQty - Number(s.qtySystem);
                    if (diff === 0) continue;

                    // stock & movement tal como ya lo hacías:
                    // (copiar el bloque existente que arma mv, actualiza stock y guarda)
                    // --- INICIO bloque existente ---
                    const mv = em.getRepository(Movement).create({
                        type: 'ADJ',
                        productId: s.productId,
                        lotId: s.lotId ?? null,
                        qty: Math.abs(diff),
                        unitCost: Number(s.avgCostAtFreeze),
                        totalCost: Math.abs(diff) * Number(s.avgCostAtFreeze) * (diff < 0 ? -1 : 1),
                        reasonCode: 'AJUSTE_INV',
                        sourceDocType: 'COUNT',
                        sourceDocId: count.code,
                        notes: `Ajuste por conteo ${count.code}`,
                        userCreated: user,
                        occurredAt: new Date(),
                        balanceQtyPost: 0,
                        balanceTotalCostPost: 0,
                        balanceAvgCostPost: 0,
                    });

                    const where = (s.lotId == null)
                        ? { productId: s.productId, lotId: IsNull() }
                        : { productId: s.productId, lotId: s.lotId };

                    let st = await em.getRepository(Stock).findOne({ where });
                    if (!st) {
                        st = em.getRepository(Stock).create({
                            productId: s.productId, lotId: s.lotId ?? null, qtyOnHand: 0, avgUnitCost: 0, totalCost: 0
                        });
                    }
                    st.qtyOnHand = Number(st.qtyOnHand) + (countedQty - Number(s.qtySystem));
                    st.totalCost = Number(st.totalCost) + ((countedQty - Number(s.qtySystem)) * Number(s.avgCostAtFreeze));
                    st.avgUnitCost = st.qtyOnHand > 0 ? Number(st.totalCost) / Number(st.qtyOnHand) : 0;
                    await em.getRepository(Stock).save(st);

                    const postLines = await em.getRepository(Stock).find({ where: { productId: s.productId } });
                    const postQty = postLines.reduce((a, x) => a + Number(x.qtyOnHand), 0);
                    const postCost = postLines.reduce((a, x) => a + Number(x.totalCost), 0);
                    const postAvg = postQty > 0 ? postCost / postQty : 0;
                    mv.balanceQtyPost = postQty; mv.balanceTotalCostPost = postCost; mv.balanceAvgCostPost = postAvg;

                    await em.getRepository(Movement).save(mv);
                    // --- FIN bloque existente ---
                    continue;
                }

                // === Caso SERIALIZADO: reconciliar sets ===
                const contados = new Set(
                    ces
                        .filter(z => z.productId === s.productId && (z.lotId ?? null) === (s.lotId ?? null))
                        .map(z => z.serialCode.trim())
                );

                // Seriales en sistema (IN_STOCK) para ese product/lot
                const whereSer: any = { productId: s.productId, status: 'IN_STOCK' as const };
                whereSer.lotId = (s.lotId == null) ? IsNull() : s.lotId;
                const enSistema = await em.getRepository(Serial).find({ where: whereSer });
                const enSistemaSet = new Set(enSistema.map(x => x.serialCode));

                // faltantes: estaban en sistema pero NO fueron contados
                const faltantesCodes = [...enSistemaSet].filter(code => !contados.has(code));
                // sobrantes: fueron contados pero NO están en sistema
                const sobrantesCodes = [...contados].filter(code => !enSistemaSet.has(code));

                // === ADJ− por faltantes: usar serial_ids ===
                if (faltantesCodes.length) {
                    const faltantesIds = enSistema
                        .filter(srl => faltantesCodes.includes(srl.serialCode))
                        .map(srl => srl.id);
                    if (faltantesIds.length) {
                        await this.movementsSvc.createMovement({
                            type: MovementTypeEnum.ADJ,
                            product_id: s.productId,
                            qty: -1 * faltantesIds.length,
                            reason_code: 'AJUSTE_INV',
                            notes: `Ajuste por conteo ${count.code} (faltantes)`,
                            lot_id: s.lotId ?? undefined,
                            source_doc_type: 'COUNT',
                            source_doc_id: count.code,
                            serial_ids: faltantesIds,
                            unit_cost: Number(s.avgCostAtFreeze), // se usará como CPP del ajuste
                        }, user);
                    }
                }

                // === ADJ+ por sobrantes: usar serial_codes ===
                if (sobrantesCodes.length) {
                    await this.movementsSvc.createMovement({
                        type: MovementTypeEnum.ADJ,
                        product_id: s.productId,
                        qty: +1 * sobrantesCodes.length,
                        reason_code: 'AJUSTE_INV',
                        notes: `Ajuste por conteo ${count.code} (sobrantes)`,
                        lot_id: s.lotId ?? undefined,
                        source_doc_type: 'COUNT',
                        source_doc_id: count.code,
                        serial_codes: sobrantesCodes,
                        unit_cost: Number(s.avgCostAtFreeze),
                    }, user);
                }
            }

            count.status = 'POSTED';
            count.postedAt = new Date();
            await em.getRepository(Count).save(count);
        });

        return this.get(id);
    }


    async cancel(id: number) {
        const count = await this.get(id);
        if (!count) throw new NotFoundException();
        count.status = 'CANCELLED';
        return this.countRepo.save(count);
    }

    private nextCode() {
        const y = new Date().getFullYear();
        const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `COUNT-${y}-${rand}`;
    }


    // los que faltaban
    async listSnapshots(id: number) {
        return this.snapRepo.find({
            where: { countId: id },
            order: { productId: 'ASC', lotId: 'ASC' }
        });
    }

    async listEntries(id: number) {
        return this.entryRepo.find({
            where: { countId: id },
            order: { countedAt: 'DESC' }
        });
    }



    async listEntrySerials(entryId: number) {
        return this.cesRepo.find({ where: { entryId }, order: { id: 'ASC' } });
    }



    // counts.service.ts (agregar dentro de la clase)
    async serialDiffs(id: number) {
        const count = await this.get(id);
        if (!count) throw new NotFoundException('Conteo no encontrado');
        if (count.status !== 'COUNTING' && count.status !== 'REVIEW') {
            throw new BadRequestException('Solo disponible en COUNTING o REVIEW');
        }

        return this.ds.transaction(async (em) => {
            const snaps = await em.getRepository(CountSnapshot).find({ where: { countId: id } });

            // Pre-cargar entradas + seriales de entradas del conteo
            const entries = await em.getRepository(CountEntry).find({ where: { countId: id } });
            const entryIds = entries.map(e => e.id);
            const ces = entryIds.length
                ? await em.getRepository(CountEntrySerial).find({ where: { entryId: In(entryIds) } })
                : [];

            // Saber qué productos son serializados
            const prodIds = Array.from(new Set(snaps.map(s => s.productId)));
            const products = await em.getRepository(Product).find({ where: { id: In(prodIds) } });
            const isSerialized = (pid: number) => products.find(p => p.id === pid)?.isSerialized ?? false;

            const result: Array<{
                product_id: number;
                lot_id: number | null;
                faltantes: string[];
                sobrantes: string[];
                coincidentes: string[];
            }> = [];

            for (const s of snaps) {
                if (!isSerialized(s.productId)) continue; // solo aplica a serializados

                // seriales contados para este product/lot en el conteo
                const contados = new Set(
                    ces
                        .filter(z => z.productId === s.productId && (z.lotId ?? null) === (s.lotId ?? null))
                        .map(z => z.serialCode.trim())
                );

                // seriales en sistema (IN_STOCK) para este product/lot
                const whereSer: any = { productId: s.productId, status: 'IN_STOCK' as const };
                whereSer.lotId = (s.lotId == null) ? IsNull() : s.lotId;
                const enSistema = await em.getRepository(Serial).find({ where: whereSer });
                const enSistemaSet = new Set(enSistema.map(x => x.serialCode.trim()));

                const faltantes = [...enSistemaSet].filter(code => !contados.has(code));
                const sobrantes = [...contados].filter(code => !enSistemaSet.has(code));
                const coincidentes = [...contados].filter(code => enSistemaSet.has(code));

                // Solo devolver si hay algo útil o si quieres ver también coincidentes
                if (faltantes.length || sobrantes.length || coincidentes.length) {
                    result.push({
                        product_id: s.productId,
                        lot_id: s.lotId ?? null,
                        faltantes,
                        sobrantes,
                        coincidentes,
                    });
                }
            }

            return result;
        });
    }










}
