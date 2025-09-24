import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { UserPermissionsService } from './user-permissions.service';
import { SetUserPermissionDto } from './dtos/set-user-permission.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin') // o el rol que quieras
@Permissions('userPerms.manage') // crea este permiso en tu tabla de permisos
@Controller('user-perms')
export class UserPermissionsController {
    constructor(private readonly svc: UserPermissionsService) { }

    @Get(':userId')
    list(@Param('userId', ParseIntPipe) userId: number) {
        return this.svc.listForUser(userId);
    }

    @Post(':userId/allow')
    async allow(
        @Param('userId', ParseIntPipe) userId: number,
        @Body() dto: SetUserPermissionDto,
    ) {
        const expires = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
        return this.svc.setAllow(userId, dto.permCode, expires, dto.scope);
    }

    @Post(':userId/deny')
    async deny(
        @Param('userId', ParseIntPipe) userId: number,
        @Body() dto: SetUserPermissionDto,
    ) {
        const expires = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
        return this.svc.setDeny(userId, dto.permCode, expires, dto.scope);
    }

    @Delete(':userId/:permCode')
    clear(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('permCode') permCode: string,
    ) {
        return this.svc.clear(userId, permCode);
    }
}
