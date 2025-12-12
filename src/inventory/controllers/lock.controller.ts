import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { LockService } from '../services/lock.service';
import { LockDto } from '../dto/lock.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
@Controller('inventory/lock')
export class LockController {
    constructor(private readonly svc: LockService) { }
    @Get() state() { return this.svc.getState(); }
    @Post() lock(@Body() dto: LockDto) { return this.svc.lock(dto.reason); }
    @Delete() unlock() { return this.svc.unlock(); }
}
