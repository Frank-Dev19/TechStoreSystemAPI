// src/rbac/guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
    private usersService: UsersService | null = null;
    constructor(
        private reflector: Reflector,
        private moduleRef: ModuleRef,


    ) { }

    private getUsersService(): UsersService {
        if (!this.usersService) {
            this.usersService = this.moduleRef.get(UsersService, { strict: false });
        }
        return this.usersService!;
    }

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const required = this.reflector.get<string[]>('perms', ctx.getHandler()) ?? [];
        if (!required.length) return true;

        const { user } = ctx.switchToHttp().getRequest();
        if (!user?.sub) return false;

        // 0) usuario fresco con roles y overrides
        const freshUser = await this.getUsersService().findOne(user.sub);

        // 1) permisos por rol
        const rolePerms = new Set(
            (freshUser?.roles ?? [])
                .flatMap((r: any) => (r.permissions ?? []).map((p: any) => p.code)),
        );

        // 2) overrides vigentes (allow/deny) — deny > allow
        const now = new Date();
        const userAllows = new Set(
            (freshUser?.overrides ?? [])
                .filter((o: any) => (!o.expiresAt || new Date(o.expiresAt) > now) && o.effect === 'allow')
                .map((o: any) => o.permission.code),
        );
        const userDenies = new Set(
            (freshUser?.overrides ?? [])
                .filter((o: any) => (!o.expiresAt || new Date(o.expiresAt) > now) && o.effect === 'deny')
                .map((o: any) => o.permission.code),
        );

        // 3) merge: permisos efectivos
        const effective = new Set<string>([...rolePerms, ...userAllows]);
        for (const d of userDenies) effective.delete(d);

        // 4) validar
        return required.every((p) => effective.has(p));
    }
}
