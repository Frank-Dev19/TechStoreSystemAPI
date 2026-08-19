import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { LockService } from '../services/lock.service';
import { LockDto } from '../dto/lock.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('inventory-manage.read')
@Controller('inventory/lock')
export class LockController {
    constructor(private readonly svc: LockService) { }
    @Get() state() { return this.svc.getState(); }
    @Post()
    @Permissions('inventory-manage.manage')
    lock(@Body() dto: LockDto) { return this.svc.lock(dto.reason); }
    @Delete()
    @Permissions('inventory-manage.manage')
    unlock() { return this.svc.unlock(); }
}
