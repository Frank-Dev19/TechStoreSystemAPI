import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) private usersRepo: Repository<User>,
        private rolesService: RolesService,
    ) { }

    async create(dto: CreateUserDto) {
        const user = new User();
        user.email = dto.email;
        user.name = dto.name;
        user.passwordHash = await bcrypt.hash(dto.password, 10);
        if (dto.roleIds?.length) {
            user.roles = await this.rolesService.findByIds(dto.roleIds);
        }
        return this.usersRepo.save(user);
    }

    async findAll(search?: string) {
        const qb = this.usersRepo.createQueryBuilder('u').leftJoinAndSelect('u.roles', 'r');
        if (search) {
            qb.where('u.email LIKE :s OR u.name LIKE :s', { s: `%${search}%` });
        }
        return qb.orderBy('u.createdAt', 'DESC').getMany();
    }

    async findOne(id: number) {
        const u = await this.usersRepo.findOne({ where: { id } });
        if (!u) throw new NotFoundException('Usuario no encontrado');
        return u;
    }

    async update(id: number, dto: UpdateUserDto) {
        const u = await this.findOne(id);
        if (dto.name) u.name = dto.name;
        if (dto.password) u.passwordHash = await bcrypt.hash(dto.password, 10);
        if (dto.roleIds) u.roles = await this.rolesService.findByIds(dto.roleIds);
        if (typeof dto.isActive === 'boolean') u.isActive = dto.isActive;
        return this.usersRepo.save(u);
    }

    async remove(id: number) {
        const u = await this.findOne(id);
        await this.usersRepo.remove(u);
        return { ok: true };
    }

    // usado por AuthService
    async findByEmail(email: string) {
        return this.usersRepo.findOne({ where: { email } });
    }

    async validateCredentials(email: string, password: string) {
        const user = await this.findByEmail(email);
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        return ok ? user : null;
    }
}
