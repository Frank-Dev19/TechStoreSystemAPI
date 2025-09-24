import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../rbac/decorators/roles.decorator';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { AssignPermissionsDto } from './dtos/assign-permissions.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('roles')
export class RolesController {

    constructor(private rolesService: RolesService) { }

    @Permissions('role.create')
    @Post()
    create(@Body() dto: CreateRoleDto) {
        return this.rolesService.create(dto);
    }

    @Permissions('role.read')
    @Get()
    findAll() {
        return this.rolesService.findAll();
    }

    @Permissions('role.read')
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.rolesService.findOne(+id);
    }

    @Permissions('role.update')
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
        return this.rolesService.update(+id, dto);
    }

    @Permissions('role.delete')
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.rolesService.remove(+id);
    }


    @Patch(':id/permissions')
    @RolesDec('admin')
    async assignPerms(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
        return this.rolesService.assignPermissionsByCode(+id, dto.permissions);
    }

}
