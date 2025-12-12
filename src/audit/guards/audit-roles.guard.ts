import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUDIT_ROLES_METADATA_KEY } from '../decorators/roles.decorator';
@Injectable()
export class AuditRolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(ctx: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(AUDIT_ROLES_METADATA_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
        ]) || [];

        if (required.length === 0) return true;

        const req = ctx.switchToHttp().getRequest();
        // Suponemos que AuthModule ya adjunta req.user = { id, roles: string[] }
        const roles: string[] = req.user?.roles || [];
        const ok = required.some(r => roles.includes(r));
        if (!ok) throw new ForbiddenException('No autorizado para ver auditoría');
        return true;
    }
}
