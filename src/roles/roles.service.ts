import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';

@Injectable()
export class RolesService {

    constructor(
        @InjectRepository(Role) private rolesRepo: Repository<Role>,
        @InjectRepository(Permission) private permsRepo: Repository<Permission>,
    ) { }

    async create(dto: CreateRoleDto) {
        const role = this.rolesRepo.create({ name: dto.name });
        if (dto.permissionIds?.length) {
            role.permissions = await this.permsRepo.find({ where: { id: In(dto.permissionIds) } });
        }
        return this.rolesRepo.save(role);
    }

    findAll() {
        return this.rolesRepo.find();
    }

    async findOne(id: number) {
        const r = await this.rolesRepo.findOne({ where: { id } });
        if (!r) throw new NotFoundException('Rol no encontrado');
        return r;
    }

    async update(id: number, dto: UpdateRoleDto) {
        const r = await this.findOne(id);
        if (dto.name) r.name = dto.name;
        if (dto.permissionIds) {
            r.permissions = await this.permsRepo.find({ where: { id: In(dto.permissionIds) } });
        }
        return this.rolesRepo.save(r);
    }

    async remove(id: number) {
        const r = await this.findOne(id);
        await this.rolesRepo.remove(r);
        return { ok: true };
    }

    // Útil para UsersService
    findByIds(ids: number[]) {
        return this.rolesRepo.find({ where: { id: In(ids) } });
    }

    // este es para poder asignar permisos a los roles
    async assignPermissionsByCode(roleId: number, codes: string[]) {
        const role = await this.rolesRepo.findOne({ where: { id: roleId }, relations: { permissions: true } });
        if (!role) throw new NotFoundException('Rol no encontrado');

        const perms = await this.permsRepo.find({ where: { code: In(codes) } }); // Asegúrate de tener permsRepo
        const current = new Set((role.permissions ?? []).map(p => p.code));
        role.permissions = [
            ...(role.permissions ?? []),
            ...perms.filter(p => !current.has(p.code)),
        ];
        return this.rolesRepo.save(role);
    }

}
