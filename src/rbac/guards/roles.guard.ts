// src/rbac/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class RolesGuard implements CanActivate {
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
        const required = this.reflector.get<string[]>('roles', ctx.getHandler()) ?? [];
        if (!required.length) return true;

        const { user } = ctx.switchToHttp().getRequest();
        if (!user?.sub) return false;

        const freshUser = await this.getUsersService().findOne(user.sub);
        return (freshUser?.roles ?? []).some((r: any) => required.includes(r.name));
    }
}
