import {
    DataSource,
    EntitySubscriberInterface,
    EventSubscriber,
    InsertEvent,
    UpdateEvent,
    RemoveEvent,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { safeJson } from '../utils/masking.util';
import { toAuditEntity } from '../utils/audit-guards.util';
import { AuditAction, AuditEntity } from '../entities/audit-log.entity';

const ENTITY_WHITELIST: AuditEntity[] = [
    'USER', 'PRODUCT', 'MOVEMENT', 'STOCK', 'LOT', 'SERIAL', 'CLIENT', 'DOC_TYPE',
    'CATEGORY', 'UNIT',
    'COUNTDIFFERENCESUMMARY', 'COUNTDIFFERENCE', 'COUNTENTRYSERIAL',
    'COUNTENTRY', 'COUNTSNAPSHOT', 'COUNT', 'MOVEMENTSERIAL',
];

// ---------- helpers internos ----------

function shouldAudit(entity: AuditEntity, id: string | null): boolean {
    if (entity === 'OTHER') return false;
    if (!ENTITY_WHITELIST.includes(entity)) return false;
    if (!id) return false;
    return true;
}

/**
 * Nombre “bonito” para el tipo de entidad (en español y con artículo).
 */
function getEntityHuman(entity: AuditEntity | undefined): string {
    switch (entity) {
        case 'PRODUCT': return 'el producto';
        case 'CATEGORY': return 'la categoría';
        case 'UNIT': return 'la unidad de medida';
        case 'USER': return 'el usuario';
        case 'AUTH': return 'la autenticación';
        default:
            // fallback seguro aunque entity sea undefined
            return String(entity ?? 'desconocido').toLowerCase();
    }
}

/**
 * Texto descriptivo de la fila (lo que va después del tipo).
 * Usamos primero name y, si hay código/SKU, lo ponemos entre paréntesis.
 */
function getEntityLabel(entity: AuditEntity | undefined, row: any): string {
    if (!row) return 'desconocido';

    const name = row.name ?? row.description ?? row.email ?? row.id ?? 'desconocido';

    const code = row.code ?? row.sku ?? null;

    if (code && code !== name) {
        return `${name} (${code})`;
    }

    return String(name);
}

/**
 * Construye el mensaje reason en función de la acción + entidad.
 */
function buildReason(
    action: AuditAction,
    entity: AuditEntity,
    before: any,
    after: any,
    id: string | null,
): string {
    const row = after ?? before ?? {};
    const label = getEntityLabel(entity, row);
    const tipo = getEntityHuman(entity);
    const idPart = id ? ` (#${id})` : '';
    const sujeto = `${tipo}${idPart}`; // ej: "la categoría (#4)"

    switch (action) {
        case 'ENTITY_CREATE':
            return `Se creó ${sujeto} ${label}`;

        case 'ENTITY_UPDATE':
            return `Se actualizó ${sujeto} ${label}`;

        case 'ENTITY_DELETE':
            return `Se eliminó ${sujeto} ${label}`;

        default:
            return `${action} sobre ${sujeto} ${label}`;
    }
}

@Injectable()
@EventSubscriber()
export class GenericSubscriber implements EntitySubscriberInterface {
    constructor(private dataSource: DataSource, private audit: AuditService) {
        this.dataSource.subscribers.push(this);
    }

    async afterInsert(event: InsertEvent<any>) {
        if (
            event.metadata.name === 'AuditLog' ||
            event.metadata.targetName === 'AuditLog'
        )
            return;

        const entity = toAuditEntity(event.metadata.name ?? 'OTHER');
        const id = this.extractId(event.entity);
        if (!shouldAudit(entity, id)) return;

        const after = safeJson(event.entity);
        const reason = buildReason('ENTITY_CREATE', entity, null, after, id);

        await this.audit
            .business('ENTITY_CREATE', {
                userId: (event.queryRunner?.data as any)?.userId ?? null,
                entity,
                entityId: id,
                before: null,
                after,
                requestId: (event.queryRunner?.data as any)?.requestId ?? null,
                reason,
            })
            .catch(() => void 0);
    }

    async afterUpdate(event: UpdateEvent<any>) {
        if (
            event.metadata.name === 'AuditLog' ||
            event.metadata.targetName === 'AuditLog'
        )
            return;

        const entity = toAuditEntity(event.metadata.name ?? 'OTHER');
        const id = this.extractId(event.entity ?? event.databaseEntity);
        if (!shouldAudit(entity, id)) return;

        const before = safeJson(event.databaseEntity);
        const after = safeJson(event.entity);
        const reason = buildReason('ENTITY_UPDATE', entity, before, after, id);

        await this.audit
            .business('ENTITY_UPDATE', {
                userId: (event.queryRunner?.data as any)?.userId ?? null,
                entity,
                entityId: id,
                before,
                after,
                requestId: (event.queryRunner?.data as any)?.requestId ?? null,
                reason,
            })
            .catch(() => void 0);
    }

    async afterRemove(event: RemoveEvent<any>) {
        if (
            event.metadata.name === 'AuditLog' ||
            event.metadata.targetName === 'AuditLog'
        ) {
            return;
        }

        const entity = toAuditEntity(event.metadata.name ?? 'OTHER');

        // 👇 Usar primero databaseEntity, luego entity
        const source = event.databaseEntity ?? event.entity;
        const id = this.extractId(source);

        if (!shouldAudit(entity, id)) return;

        const before = safeJson(source);
        const reason = buildReason('ENTITY_DELETE', entity, before, null, id);

        await this.audit
            .business('ENTITY_DELETE', {
                userId: (event.queryRunner?.data as any)?.userId ?? null,
                entity,
                entityId: id,
                before,
                after: null,
                requestId: (event.queryRunner?.data as any)?.requestId ?? null,
                reason,
            })
            .catch(() => void 0);
    }


    private extractId(entity: any): string | null {
        if (!entity) return null;
        return (
            (entity.id ?? entity.uuid ?? entity.code ?? null)?.toString() ?? null
        );
    }
}
