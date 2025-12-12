import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLog, AuditEntity, AuditAction } from './entities/audit-log.entity';
import { SearchAuditDto, AuditSearchResponse } from './dto/search-audit.dto';
import { safeJson } from './utils/masking.util';

import { RequestContext } from 'src/common/request-context';

type AuditEntry = {
    userId: number | null;
    action: string;
    status: number;
    durationMs: number;
    meta?: any;
    before?: any;
    after?: any;
};

@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(AuditLog)
        private readonly repo: Repository<AuditLog>,
    ) { }

    async create(partial: Partial<AuditLog>): Promise<AuditLog> {
        const entity = this.repo.create(partial);
        return await this.repo.save(entity);
    }

    async http(entry: {
        userId: number | null;
        method: string | null;
        path: string | null;
        status: number | null;
        durationMs: number | null;
        ip: string | null;
        userAgent: string | null;
        requestId: string | null;
        sessionId: string | null;
        before?: any;
        after?: any;
    }) {
        const ctx = RequestContext.get();

        // Mensaje simple para las filas HTTP
        const baseReason = `${entry.method ?? ctx?.method ?? ''} ${entry.path ?? ctx?.path ?? ''}`.trim();
        const statusPart = entry.status ? ` (status ${entry.status})` : '';
        const reason = baseReason ? `HTTP ${baseReason}${statusPart}` : null;

        return this.create({
            action: 'HTTP',
            entity: 'SYSTEM',
            entityId: null,
            ...entry,
            actorEmail: ctx?.actorEmail ?? null,
            actorName: ctx?.actorName ?? null,
            reason,
            before: safeJson(entry.before),
            after: safeJson(entry.after),
        });
    }


    async business(action: AuditAction, payload: {
        userId: number | null;
        entity: AuditEntity;
        entityId?: string | null;
        reason?: string | null;
        keyId?: string | null;
        before?: any;
        after?: any;
        requestId?: string | null;
        sessionId?: string | null;
        ip?: string | null;
        userAgent?: string | null;
        method?: string | null;
        path?: string | null;
        actorEmail?: string | null; // opcional explícito
        actorName?: string | null; // opcional explícito
    }) {
        const ctx = RequestContext.get();

        return this.create({
            action,
            entity: payload.entity,
            entityId: payload.entityId ?? null,

            // ← si no te lo pasan explícito, cae al contexto
            userId: payload.userId ?? ctx?.userId ?? null,
            // 👇 NUEVO: guarda el “quién”
            actorEmail: payload.actorEmail ?? ctx?.actorEmail ?? null,
            actorName: payload.actorName ?? ctx?.actorName ?? null,
            requestId: payload.requestId ?? ctx?.requestId ?? null,
            sessionId: payload.sessionId ?? null,
            ip: payload.ip ?? ctx?.ip ?? null,
            userAgent: payload.userAgent ?? ctx?.userAgent ?? null,
            method: payload.method ?? ctx?.method ?? null,
            path: payload.path ?? ctx?.path ?? null,

            status: null,
            durationMs: null,
            reason: payload.reason ?? null,
            keyId: payload.keyId ?? null,
            before: safeJson(payload.before),
            after: safeJson(payload.after),
        });
    }

    async search(dto: SearchAuditDto): Promise<AuditSearchResponse<AuditLog>> {
        const qb = this.repo.createQueryBuilder('a');

        // Filtro por rango de fechas usando createdAt
        qb.where('a.createdAt BETWEEN :from AND :to', {
            from: new Date(dto.from),
            to: new Date(dto.to + 'T23:59:59.999Z'),
        });

        if (dto.userId) qb.andWhere('a.userId = :userId', { userId: dto.userId });
        if (dto.action) qb.andWhere('a.action = :action', { action: dto.action });
        if (dto.entity) qb.andWhere('a.entity = :entity', { entity: dto.entity });
        if (dto.status) qb.andWhere('a.status = :status', { status: dto.status });
        if (dto.method) qb.andWhere('a.method = :method', { method: dto.method });

        if (dto.q) {
            // búsqueda simple en path, entityId y requestId
            qb.andWhere(
                '(a.path LIKE :q OR a.entityId LIKE :q OR a.requestId LIKE :q)',
                { q: `%${dto.q}%` },
            );
        }

        const page = dto.page ?? 1;
        const pageSize = dto.pageSize ?? 20;

        // Sort: por compat, si viene "ts:desc" lo tratamos como "createdAt:desc"
        const sortRaw = (dto.sort ?? 'createdAt:desc').toLowerCase();
        const dir = sortRaw.endsWith('asc') ? 'ASC' : 'DESC';

        const [items, total] = await qb
            .orderBy('a.createdAt', dir)
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        return { items, total, page, pageSize };
    }

    async findById(id: number): Promise<AuditLog | null> {
        return await this.repo.findOne({ where: { id } });
    }

}
