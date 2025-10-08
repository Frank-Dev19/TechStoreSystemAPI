// src/users/users.controller.ts
import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, ParseIntPipe
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { BulkIdsDto } from './dtos/bulk-ids.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../rbac/decorators/roles.decorator';
import { Permissions } from '../rbac/decorators/permissions.decorator';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) { }


    // ====== SOFT DELETE (varios o uno) por body ======
    @Permissions('users.delete')
    @Patch('soft-delete')
    softDeleteMany(@Body() dto: BulkIdsDto) {
        return this.usersService.softRemoveMany(dto.ids);
    }

    // ====== RESTORE (varios o uno) por body ======
    @Permissions('users.update')
    @Patch('restore')
    restoreMany(@Body() dto: BulkIdsDto) {
        return this.usersService.restoreMany(dto.ids);
    }

    // ====== HARD DELETE (varios o uno) por body ======
    // Usamos POST para evitar problemas con proxies que ignoran body en DELETE
    @Permissions('users.delete')
    @Post('hard-delete')
    hardRemoveMany(@Body() dto: BulkIdsDto) {
        return this.usersService.hardRemoveMany(dto.ids);
    }


    @Permissions('users.create')
    @Post()
    create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Permissions('users.read')
    @Get()
    findAll(@Query('search') search?: string) {
        return this.usersService.findAll(search);
    }

    @Permissions('users.read')
    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.findOne(id);
    }

    @Permissions('users.update')
    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
        return this.usersService.update(id, dto);
    }


}
