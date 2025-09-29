// src/users/users.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { RolesService } from '../roles/roles.service';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) private usersRepo: Repository<User>,
        @InjectRepository(DocumentType) private dtRepo: Repository<DocumentType>,
        private rolesService: RolesService,
    ) { }

    // ---------- helpers ----------
    private async ensureDocumentType(id: number) {
        const dt = await this.dtRepo.findOne({ where: { id } });
        if (!dt) throw new NotFoundException('Document type not found');
        return dt;
    }

    private async ensureEmailUnique(email: string, ignoreId?: number) {
        const exists = await this.usersRepo.findOne({ where: { email }, select: ['id'] });
        if (exists && exists.id !== ignoreId) throw new ConflictException('Email ya esta en uso');
    }

    private async ensureDocNumberUnique(documentNumber: string, ignoreId?: number) {
        const exists = await this.usersRepo.findOne({ where: { documentNumber }, select: ['id'] });
        if (exists && exists.id !== ignoreId) throw new ConflictException('Numero de Documento ya esta en uso');
    }

    // ---------- CRUD ----------
    async create(dto: CreateUserDto) {
        await this.ensureEmailUnique(dto.email);
        await this.ensureDocNumberUnique(dto.documentNumber);

        const user = new User();
        user.email = dto.email;
        user.name = dto.name;
        user.phone = dto.phone ?? null;
        user.documentType = await this.ensureDocumentType(dto.documentTypeId);
        user.documentNumber = dto.documentNumber;
        user.passwordHash = await bcrypt.hash(dto.password, 10);

        if (dto.roleIds?.length) {
            user.roles = await this.rolesService.findByIds(dto.roleIds);
        }
        return this.usersRepo.save(user);
    }

    async findAll(search?: string) {
        const qb = this.usersRepo
            .createQueryBuilder('u')
            .leftJoinAndSelect('u.roles', 'r')
            .leftJoinAndSelect('u.documentType', 'dt')
            .withDeleted(); // para poder ver también borrados si quisieras (opcional)

        if (search) {
            qb.where(
                '(u.email LIKE :s OR u.name LIKE :s OR u.documentNumber LIKE :s)',
                { s: `%${search}%` },
            );
        }
        return qb.orderBy('u.createdAt', 'DESC').getMany();
    }

    async findOne(id: number) {
        const u = await this.usersRepo.findOne({ where: { id }, withDeleted: true });
        if (!u) throw new NotFoundException('Usuario no encontrado');
        return u;
    }

    async update(id: number, dto: UpdateUserDto) {
        const u = await this.findOne(id);

        if (dto.email) await this.ensureEmailUnique(dto.email, id);
        if (dto.documentNumber) await this.ensureDocNumberUnique(dto.documentNumber, id);

        if (dto.name !== undefined) u.name = dto.name;
        if (dto.phone !== undefined) u.phone = dto.phone ?? null;
        if (dto.documentTypeId !== undefined) {
            u.documentType = await this.ensureDocumentType(dto.documentTypeId);
        }
        if (dto.documentNumber !== undefined) u.documentNumber = dto.documentNumber;

        if (dto.password) u.passwordHash = await bcrypt.hash(dto.password, 10);
        if (dto.roleIds) u.roles = await this.rolesService.findByIds(dto.roleIds);
        if (typeof dto.isActive === 'boolean') u.isActive = dto.isActive;

        return this.usersRepo.save(u);
    }

    // ---------- SOFT delete (uno) ----------
    async remove(id: number) {
        // soft + desactivar
        await this.usersRepo.update({ id }, { isActive: false });
        await this.usersRepo.softDelete(id);
        return { ok: true };
    }

    // ---------- SOFT delete (varios) ----------
    async softRemoveMany(ids: number[]) {
        const unique = [...new Set(ids)];
        if (!unique.length) return { ok: true };
        await this.usersRepo.update({ id: In(unique) }, { isActive: false });
        await this.usersRepo.softDelete(unique);
        return { ok: true };
    }

    // ---------- RESTORE (varios) ----------
    async restoreMany(ids: number[]) {
        if (!ids?.length) return { ok: true };
        await this.usersRepo.restore(ids);
        await this.usersRepo.update({ id: In(ids) }, { isActive: true });
        return { ok: true };
    }

    // ---------- HARD delete (uno o varios) ----------
    async hardRemoveMany(ids: number[]) {
        if (!ids?.length) return { ok: true };
        // Elimina físicamente (no queda registro)
        await this.usersRepo.delete(ids);
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

    async setPassword(userId: number, plain: string) {
        const u = await this.findOne(userId);
        u.passwordHash = await bcrypt.hash(plain, 10);
        await this.usersRepo.save(u);
        return { ok: true };
    }
}
