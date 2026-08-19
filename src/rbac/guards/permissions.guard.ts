// src/rbac/guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import { UsersService } from 'src/users/users.service';
import { getEffectivePermissionCodes } from '../utils/effective-permissions.util';

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
        const required = this.reflector.getAllAndOverride<string[]>('perms', [
            ctx.getHandler(),
            ctx.getClass(),
        ]) ?? [];
        if (!required.length) return true;

        const { user } = ctx.switchToHttp().getRequest();
        if (!user?.sub) return false;

        // 0) usuario fresco con roles y overrides
        const freshUser = await this.getUsersService().findOne(user.sub);

        const effective = new Set(getEffectivePermissionCodes(freshUser));
        return required.every((p) => effective.has(p));
    }
}
