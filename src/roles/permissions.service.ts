import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { PermissionModule } from './entities/permission-module.entity';


@Injectable()
export class PermissionsService {
    constructor(
        @InjectRepository(Permission) private readonly permsRepo: Repository<Permission>,
        @InjectRepository(PermissionModule) private readonly modulesRepo: Repository<PermissionModule>,
    ) { }

    private async ensureModule(moduleKey: string): Promise<PermissionModule> {
        const mod = await this.modulesRepo.findOne({ where: { moduleKey } });
        if (!mod) throw new NotFoundException(`PermissionModule "${moduleKey}" no existe`);
        return mod;
    }

    private async ensureCodeUnique(code: string, ignoreId?: number) {
        const exists = await this.permsRepo.findOne({ where: { code } });
        if (exists && exists.id !== ignoreId) {
            throw new ConflictException(`El permiso "${code}" ya existe`);
        }
    }

    async create(dto: CreatePermissionDto) {
        const module = await this.ensureModule(dto.moduleKey);
        const code = `${dto.moduleKey}.${dto.actionKey}`;
        await this.ensureCodeUnique(code);

        const p = this.permsRepo.create({
            code,
            description: dto.description,
            actionKey: dto.actionKey,
            sortOrder: dto.sortOrder ?? 0,
            module,
        });
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
        return this.permsRepo.findOne({ where: { code } });
    }

    async update(id: number, dto: UpdatePermissionDto) {
        const p = await this.findOne(id);

        // Si cambian moduleKey/actionKey, recalculamos code y validamos unicidad
        let moduleToUse = p.module;
        let actionToUse = p.actionKey;
        let codeToUse = p.code;

        if (dto.moduleKey) moduleToUse = await this.ensureModule(dto.moduleKey);
        if (dto.actionKey) actionToUse = dto.actionKey;

        if (dto.moduleKey || dto.actionKey) {
            codeToUse = `${dto.moduleKey ?? p.module.moduleKey}.${dto.actionKey ?? p.actionKey}`;
            await this.ensureCodeUnique(codeToUse, p.id);
            p.code = codeToUse;
            p.actionKey = actionToUse;
            p.module = moduleToUse;
        }

        if (dto.description !== undefined) p.description = dto.description;
        if (dto.sortOrder !== undefined) p.sortOrder = dto.sortOrder;

        return this.permsRepo.save(p);
    }

    async remove(id: number) {
        const p = await this.findOne(id);
        await this.permsRepo.remove(p);
        return { ok: true };
    }

    // ---------- Árbol para UI ----------
    /**
     * Devuelve:
     * [
     *  { moduleId, moduleKey, moduleLabel, icon, children: [{id, code, description, actionKey}] }
     * ]
     */
    async findTree() {
        const [modules, perms] = await Promise.all([
            this.modulesRepo.find({ order: { sortOrder: 'ASC', label: 'ASC' } }),
            this.permsRepo.find({ order: { code: 'ASC' } }), // module eager
        ]);

        const byModuleId = new Map<number, any[]>();
        perms.forEach(p => {
            const list = byModuleId.get(p.module.id) ?? [];
            list.push({
                id: p.id,
                code: p.code,
                description: p.description,
                actionKey: p.actionKey ?? null,
            });
            byModuleId.set(p.module.id, list);
        });

        return modules.map(m => ({
            moduleId: m.id,
            moduleKey: m.moduleKey,
            moduleLabel: m.label,
            icon: m.icon ?? null,
            children: byModuleId.get(m.id) ?? [],
        }));
    }
}
