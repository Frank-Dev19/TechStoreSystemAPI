import { AUDIT_ENTITIES, AuditEntity } from '../entities/audit-log.entity';

export function toAuditEntity(name: string): AuditEntity {
    const upper = (name ?? '').toUpperCase();
    return (AUDIT_ENTITIES as readonly string[]).includes(upper)
        ? (upper as AuditEntity)
        : 'OTHER';
}
