import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPermission, OverrideEffect } from './entities/user-permission.entity';
import { UsersService } from './users.service';
import { PermissionsService } from 'src/roles/permissions.service';

@Injectable()
export class UserPermissionsService {
    constructor(
        @InjectRepository(UserPermission) private repo: Repository<UserPermission>,
        private users: UsersService,
        private perms: PermissionsService,
    ) { }

    async listForUser(userId: number) {
        const user = await this.users.findOne(userId);
        return this.repo.find({ where: { user: { id: user.id } } });
    }

    async setAllow(userId: number, permCode: string, expiresAt?: Date, scope?: Record<string, any>) {
        return this.upsert(userId, permCode, 'allow', expiresAt, scope);
    }

    async setDeny(userId: number, permCode: string, expiresAt?: Date, scope?: Record<string, any>) {
        return this.upsert(userId, permCode, 'deny', expiresAt, scope);
    }

    async clear(userId: number, permCode: string) {
        const user = await this.users.findOne(userId);
        const perm = await this.perms.findByCode(permCode);
        if (!perm) throw new NotFoundException('Permiso no existe');
        await this.repo.delete({ user: { id: user.id }, permission: { id: perm.id } as any });
        return { ok: true };
    }

    private async upsert(
        userId: number,
        permCode: string,
        effect: OverrideEffect,
        expiresAt?: Date,
        scope?: Record<string, any>,
    ) {
        const user = await this.users.findOne(userId);
        const perm = await this.perms.findByCode(permCode);
        if (!perm) throw new NotFoundException('Permiso no existe');

        let r = await this.repo.findOne({
            where: { user: { id: user.id }, permission: { id: perm.id } },
        });

        if (!r) {
            r = this.repo.create({
                user,
                permission: perm,
                effect,
                expiresAt: expiresAt ?? null,
                scope: scope ?? null,
            });
        } else {
            r.effect = effect;
            r.expiresAt = expiresAt ?? null;
            r.scope = scope ?? null;
        }

        return this.repo.save(r);
    }
}
