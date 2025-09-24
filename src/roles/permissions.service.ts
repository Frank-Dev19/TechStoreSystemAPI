import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';

@Injectable()
export class PermissionsService {
    constructor(
        @InjectRepository(Permission)
        private readonly permsRepo: Repository<Permission>,
    ) { }

    async create(dto: CreatePermissionDto) {
        const p = this.permsRepo.create(dto);
        return this.permsRepo.save(p);
    }

    findAll() {
        return this.permsRepo.find();
    }

    async findOne(id: number) {
        const p = await this.permsRepo.findOne({ where: { id } });
        if (!p) throw new NotFoundException('Permiso no encontrado');
        return p;
    }

    async findByCode(code: string) {
        const trimmed = code.trim();
        return this.permsRepo.findOne({ where: { code: trimmed } });
    }

    async update(id: number, dto: UpdatePermissionDto) {
        const p = await this.findOne(id);
        Object.assign(p, dto);
        return this.permsRepo.save(p);
    }

    async remove(id: number) {
        const p = await this.findOne(id);
        await this.permsRepo.remove(p);
        return { ok: true };
    }
}
