import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Count } from '../entities/count.entity';
import { CountSnapshot } from '../entities/count-snapshot.entity';
import { CountEntry } from '../entities/count-entry.entity';
import { Stock } from '../entities/stock.entity';
import { Movement } from '../entities/movement.entity';

@Injectable()
export class CountsService {
    constructor(
        private readonly ds: DataSource,
        @InjectRepository(Count) private countRepo: Repository<Count>,
        @InjectRepository(CountSnapshot) private snapRepo: Repository<CountSnapshot>,
        @InjectRepository(CountEntry) private entryRepo: Repository<CountEntry>,
        @InjectRepository(Stock) private stockRepo: Repository<Stock>,
        @InjectRepository(Movement) private movRepo: Repository<Movement>,
    ) { }

    create(dto: { code?: string; description?: string }, user = 'API') {
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

    async addEntry(id: number, entry: { product_id: number; lot_id?: number | null; qty_counted: number; user?: string }) {
        const count = await this.get(id);
        if (!count || count.status !== 'COUNTING') throw new BadRequestException('Conteo no está en COUNTING');
        const ce = this.entryRepo.create({
            countId: id, productId: entry.product_id, lotId: entry.lot_id ?? null,
            qtyCounted: entry.qty_counted, countedBy: entry.user ?? 'API',
        });
        return this.entryRepo.save(ce);
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






    async review(id: number) {
        const count = await this.get(id);
        if (!count || count.status !== 'COUNTING') throw new BadRequestException('Debe estar en COUNTING');
        count.status = 'REVIEW';
        return this.countRepo.save(count);
    }

    async post(id: number, user = 'API') {
        const count = await this.get(id);
        if (!count || count.status !== 'REVIEW') throw new BadRequestException('Debe estar en REVIEW');

        await this.ds.transaction(async (em) => {
            const snaps = await em.getRepository(CountSnapshot).find({ where: { countId: id } });
            const entries = await em.getRepository(CountEntry).find({ where: { countId: id } });

            for (const s of snaps) {
                const e = entries.find((x) => x.productId === s.productId && (x.lotId ?? null) === (s.lotId ?? null));
                const counted = Number(e?.qtyCounted ?? 0);
                const diff = counted - Number(s.qtySystem);
                if (diff === 0) continue;

                // crear movimiento ADJ valorizado con avg_cost de freeze
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

                // aplicar sobre stock (misma lógica simple)
                // línea de stock

                // const where: any = { productId: s.productId };
                // where.lot_id = (s.lotId == null) ? IsNull() : s.lotId;

                const where = (s.lotId == null)
                    ? { productId: s.productId, lotId: IsNull() }
                    : { productId: s.productId, lotId: s.lotId };

                let st = await em.getRepository(Stock).findOne({ where });
                if (!st) {
                    st = em.getRepository(Stock).create({
                        productId: s.productId,
                        lotId: s.lotId ?? null,
                        qtyOnHand: 0,
                        avgUnitCost: 0,
                        totalCost: 0
                    });
                }

                st.qtyOnHand = Number(st.qtyOnHand) + diff;
                st.totalCost = Number(st.totalCost) + (diff * Number(s.avgCostAtFreeze));
                st.avgUnitCost = st.qtyOnHand > 0 ? Number(st.totalCost) / Number(st.qtyOnHand) : 0;
                await em.getRepository(Stock).save(st);

                // saldos globales post
                const postLines = await em.getRepository(Stock).find({ where: { productId: s.productId } });
                const postQty = postLines.reduce((a, x) => a + Number(x.qtyOnHand), 0);
                const postCost = postLines.reduce((a, x) => a + Number(x.totalCost), 0);
                const postAvg = postQty > 0 ? postCost / postQty : 0;
                mv.balanceQtyPost = postQty; mv.balanceTotalCostPost = postCost; mv.balanceAvgCostPost = postAvg;

                await em.getRepository(Movement).save(mv);
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


}
