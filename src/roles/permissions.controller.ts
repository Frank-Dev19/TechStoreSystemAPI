import {
    Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';

@Controller('permissions')
@UseGuards(JwtAccessGuard, RolesGuard)
@RolesDec('admin') // tu rol es en minúsculas
export class PermissionsController {
    constructor(private readonly service: PermissionsService) { }

    @Post()
    create(@Body() dto: CreatePermissionDto) {
        return this.service.create(dto);
    }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePermissionDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }

    @Get('tree')
    findTree() {
        return this.service.findTree();
    }
}
