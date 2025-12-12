import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    CreateDateColumn,
} from 'typeorm';

// export type AuditAction =
//     | 'HTTP'
//     | 'LOGIN_SUCCESS'
//     | 'LOGIN_FAILURE'
//     | 'LOGOUT'
//     | 'ENTITY_CREATE'
//     | 'ENTITY_UPDATE'
//     | 'ENTITY_DELETE'
//     | 'BUSINESS';

// export type AuditEntity =
//     | 'AUTH'
//     | 'USER'
//     | 'PRODUCT'
//     | 'MOVEMENT'
//     | 'STOCK'
//     | 'LOT'
//     | 'SERIAL'
//     | 'CLIENT'
//     | 'DOC_TYPE'
//     | 'SYSTEM'
//     | 'OTHER';

export const AUDIT_ACTIONS = [
    'HTTP', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT',
    'ENTITY_CREATE', 'ENTITY_UPDATE', 'ENTITY_DELETE', 'BUSINESS',
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];

export const AUDIT_ENTITIES = [
    'AUTH', 'USER', 'PRODUCT', 'MOVEMENT', 'STOCK', 'LOT', 'SERIAL',
    'CLIENT', 'DOC_TYPE', 'SYSTEM', 'OTHER', 'CATEGORY', 'UNIT', 'COUNTDIFFERENCESUMMARY', 'COUNTDIFFERENCE', 'COUNTENTRYSERIAL', 'COUNTENTRY', 'COUNTSNAPSHOT', 'COUNT', , 'MOVEMENTSERIAL',

] as const;
export type AuditEntity = typeof AUDIT_ENTITIES[number];

export const AUDIT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type AuditMethod = typeof AUDIT_METHODS[number];


@Entity({ name: 'audit_log' })
@Index(['createdAt'])
@Index(['userId', 'createdAt'])
@Index(['entity', 'entityId', 'createdAt'])
@Index(['action', 'status', 'createdAt'])
export class AuditLog {
    @PrimaryGeneratedColumn()
    id!: number;

    // Usa 'timestamp' o 'datetime' según tu compatibilidad
    @CreateDateColumn({ type: 'datetime' })
    createdAt!: Date;

    @Column({ type: 'int', nullable: true })
    userId!: number | null;

    // 👇 NUEVO
    @Column({ type: 'varchar', length: 256, nullable: true })
    actorEmail!: string | null;

    // 👇 NUEVO
    @Column({ type: 'varchar', length: 128, nullable: true })
    actorName!: string | null;

    @Column({ type: 'varchar', length: 64 })
    action!: AuditAction;

    @Column({ type: 'varchar', length: 64 })
    entity!: AuditEntity;

    @Column({ type: 'varchar', length: 128, nullable: true })
    entityId!: string | null;

    @Column({ type: 'varchar', length: 8, nullable: true })
    method!: string | null;

    @Column({ type: 'varchar', length: 512, nullable: true })
    path!: string | null;

    @Column({ type: 'int', nullable: true })
    status!: number | null;

    @Column({ type: 'int', nullable: true })
    durationMs!: number | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    ip!: string | null;

    @Column({ type: 'varchar', length: 256, nullable: true })
    userAgent!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    requestId!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    sessionId!: string | null;

    @Column({ type: 'varchar', length: 256, nullable: true })
    reason!: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    keyId!: string | null;

    @Column({ type: 'json', nullable: true })
    before!: any;

    @Column({ type: 'json', nullable: true })
    after!: any;
}
