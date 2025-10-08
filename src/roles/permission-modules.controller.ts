import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { PermissionModulesService } from './permission-modules.service';
import { CreatePermissionModuleDto } from './dtos/create-permission-module.dto';
import { UpdatePermissionModuleDto } from './dtos/update-permission-module.dto';

@Controller('permission-modules')
@UseGuards(JwtAccessGuard, RolesGuard)
@RolesDec('admin')
export class PermissionModulesController {
    constructor(private readonly service: PermissionModulesService) { }

    @Post()
    create(@Body() dto: CreatePermissionModuleDto) {
        return this.service.create(dto);
    }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdatePermissionModuleDto) {
        return this.service.update(+id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(+id);
    }
}
