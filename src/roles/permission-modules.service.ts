import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionModule } from './entities/permission-module.entity';
import { CreatePermissionModuleDto } from './dtos/create-permission-module.dto';
import { UpdatePermissionModuleDto } from './dtos/update-permission-module.dto';

@Injectable()
export class PermissionModulesService {
    constructor(@InjectRepository(PermissionModule) private repo: Repository<PermissionModule>) { }

    create(dto: CreatePermissionModuleDto) {
        const m = this.repo.create(dto);
        m.moduleKey = m.moduleKey.trim().toLowerCase();
        return this.repo.save(m);
    }

    findAll() {
        return this.repo.find({ order: { sortOrder: 'ASC', label: 'ASC' } });
    }

    async findOne(id: number) {
        const m = await this.repo.findOne({ where: { id } });
        if (!m) throw new NotFoundException('Módulo no encontrado');
        return m;
    }

    async update(id: number, dto: UpdatePermissionModuleDto) {
        const m = await this.findOne(id);
        Object.assign(m, dto);
        if (dto.moduleKey) m.moduleKey = dto.moduleKey.trim().toLowerCase();
        return this.repo.save(m);
    }

    async remove(id: number) {
        const m = await this.findOne(id);
        await this.repo.remove(m);
        return { ok: true };
    }
}
