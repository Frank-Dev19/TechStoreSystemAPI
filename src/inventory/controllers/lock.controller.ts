import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { LockService } from '../services/lock.service';
import { LockDto } from '../dto/lock.dto';

@Controller('inventory/lock')
export class LockController {
    constructor(private readonly svc: LockService) { }
    @Get() state() { return this.svc.getState(); }
    @Post() lock(@Body() dto: LockDto) { return this.svc.lock(dto.reason); }
    @Delete() unlock() { return this.svc.unlock(); }
}
