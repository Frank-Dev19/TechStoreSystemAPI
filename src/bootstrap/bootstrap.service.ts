import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
//import { Permission } from 'src/rbac/entities/permission.entity';
import { Permission } from 'src/roles/entities/permission.entity';
// imports NUEVO
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';



@Injectable()
export class BootstrapService implements OnModuleInit {
    private readonly log = new Logger(BootstrapService.name);

    constructor(
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
        @InjectRepository(Permission) private readonly permsRepo: Repository<Permission>,
        @InjectRepository(DocumentType) private readonly docTypesRepo: Repository<DocumentType>,
    ) { }

    async onModuleInit() {

        // ===== DocumentType por defecto =====
        let defaultDt = await this.docTypesRepo.findOne({ where: { name: 'DNI' } });
        if (!defaultDt) {
            // si no hay, crea uno rapidito (mínimo)
            defaultDt = this.docTypesRepo.create({ name: 'DNI', isActive: true });
            defaultDt = await this.docTypesRepo.save(defaultDt);
        }

        // Si ya hay usuarios, asumimos que el sistema está inicializado
        const usersCount = await this.usersRepo.count();
        if (usersCount > 0) {
            this.log.log('Bootstrap omitido: ya existen usuarios.');
            return;
        }

        this.log.log('Ejecutando seed inicial…');

        // 1) Rol 'admin' (minúsculas para matchear tu @RolesDec('admin'))
        let adminRole = await this.rolesRepo.findOne({ where: { name: 'admin' } });
        if (!adminRole) {
            adminRole = this.rolesRepo.create({ name: 'admin' });
            adminRole = await this.rolesRepo.save(adminRole);
        }

        // 2) Permisos base (code + description son obligatorios)
        const basePerms: Array<{ code: string; description: string }> = [
            { code: 'role.create', description: 'Crear roles' },
            { code: 'role.read', description: 'Listar/ver roles' },
            { code: 'role.update', description: 'Actualizar roles' },
            { code: 'role.delete', description: 'Eliminar roles' },

            { code: 'keys.manage', description: 'Crear/rotar claves de operación' },
            { code: 'keys.view', description: 'Ver claves de operación activas' },

            { code: 'suppliers.create', description: 'Crear proveedores' },
            { code: 'suppliers.view', description: 'Listar/ver proveedores' },
            // agrega los que necesites a futuro (sales, inventory, etc.)
        ];

        const codes = basePerms.map(p => p.code);
        const existing = await this.permsRepo.find({ where: { code: In(codes) } });
        const existingCodes = new Set(existing.map(p => p.code));
        const toInsert = basePerms.filter(p => !existingCodes.has(p.code));

        if (toInsert.length) {
            const entities = this.permsRepo.create(toInsert);
            await this.permsRepo.save(entities);
        }

        // recargar todos los permisos para asignar al rol
        const allPerms = await this.permsRepo.find({ where: { code: In(codes) } });

        // 3) Asignar TODOS los permisos al rol 'admin' (respetando existentes)
        const roleWithPerms = await this.rolesRepo.findOne({
            where: { id: adminRole.id },
            relations: { permissions: true },
        });

        const current = new Set((roleWithPerms?.permissions ?? []).map(p => p.code));
        const merged = [
            ...(roleWithPerms?.permissions ?? []),
            ...allPerms.filter(p => !current.has(p.code)),
        ];
        adminRole.permissions = merged;
        await this.rolesRepo.save(adminRole);

        // 4) Crear usuario admin y asignarle el rol 'admin'
        const email = 'admin@test.com';
        const plainPwd = 'Admin123';
        const passwordHash = await bcrypt.hash(plainPwd, 10);

        let adminUser = await this.usersRepo.findOne({
            where: { email },
            relations: { roles: true },
        });

        if (!adminUser) {
            adminUser = this.usersRepo.create({
                email,
                name: 'Administrador',
                passwordHash,
                roles: [adminRole],
                isActive: true,
                documentType: defaultDt,
                documentNumber: '00000000', // opcional
                phone: '999999999',          // opcional
            });
        } else {
            // asegurar rol
            const roleNames = new Set((adminUser.roles ?? []).map(r => r.name));
            if (!roleNames.has('admin')) {
                adminUser.roles = [...(adminUser.roles ?? []), adminRole];
            }
            // asegurar passwordHash si estuviera vacío
            if (!adminUser.passwordHash) adminUser.passwordHash = passwordHash;
            if (adminUser.name == null || adminUser.name.trim() === '') {
                adminUser.name = 'Administrador';
            }
            if (adminUser.isActive == null) adminUser.isActive = true;
            if (!adminUser.documentType) adminUser.documentType = defaultDt;
        }

        await this.usersRepo.save(adminUser);

        this.log.log(
            'Seed inicial OK → rol "admin", permisos base y usuario admin@test.com / Admin123',
        );
    }
}
