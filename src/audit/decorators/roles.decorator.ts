import { SetMetadata } from '@nestjs/common';
export const AUDIT_ROLES_METADATA_KEY = 'audit_roles';
export const AuditRoles = (...roles: string[]) => SetMetadata(AUDIT_ROLES_METADATA_KEY, roles);
// Ej: @AuditRoles('AUDIT_VIEWER','AUDIT_ADMIN')
