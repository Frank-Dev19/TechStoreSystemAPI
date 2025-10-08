import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/roles/entities/permission.entity';
import { PermissionModule } from 'src/roles/entities/permission-module.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';

type ModuleSeed = { moduleKey: string; label: string; sortOrder: number; icon?: string | null };
type PermSeed = { moduleKey: string; actionKey: string; description: string; sortOrder?: number };

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly log = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permsRepo: Repository<Permission>,
    @InjectRepository(PermissionModule) private readonly permModulesRepo: Repository<PermissionModule>,
    @InjectRepository(DocumentType) private readonly docTypesRepo: Repository<DocumentType>,
  ) { }

  async onModuleInit() {
    // 0) Asegurar DocumentType por defecto (DNI) con soft delete considerado
    await this.ensureDefaultDocumentType();

    // 1) Catálogo de módulos (fuente de verdad)
    const MODULES: ModuleSeed[] = [
      { moduleKey: 'role', label: 'Roles', sortOrder: 10, icon: 'fas fa-shield-alt' },
      { moduleKey: 'keys', label: 'Claves de Operación', sortOrder: 15, icon: 'fas fa-key' },
      { moduleKey: 'users', label: 'Usuarios', sortOrder: 20, icon: 'fas fa-users' },
      { moduleKey: 'document-type', label: 'Tipos de Documento', sortOrder: 25, icon: 'fas fa-id-card' },
      { moduleKey: 'suppliers', label: 'Proveedores', sortOrder: 30, icon: 'fas fa-truck' },
      { moduleKey: 'auditoria', label: 'Auditoría', sortOrder: 90, icon: 'fas fa-history' },
      { moduleKey: 'business-partner', label: 'Socios de Comercio', sortOrder: 100, icon: 'fas fa-handshake' } // ejemplo futuro
    ];

    // 2) Catálogo de permisos (fuente de verdad)
    const PERMS: PermSeed[] = [
      // Roles
      { moduleKey: 'role', actionKey: 'create', description: 'Crear roles', sortOrder: 10 },
      { moduleKey: 'role', actionKey: 'read', description: 'Listar/ver roles', sortOrder: 20 },
      { moduleKey: 'role', actionKey: 'update', description: 'Actualizar roles', sortOrder: 30 },
      { moduleKey: 'role', actionKey: 'delete', description: 'Eliminar roles', sortOrder: 40 },

      // Keys
      { moduleKey: 'keys', actionKey: 'manage', description: 'Crear/rotar claves de operación', sortOrder: 10 },
      { moduleKey: 'keys', actionKey: 'view', description: 'Ver claves de operación activas', sortOrder: 20 },

      // Users (si no los tenías antes en la tabla)
      { moduleKey: 'users', actionKey: 'create', description: 'Crear usuarios', sortOrder: 10 },
      { moduleKey: 'users', actionKey: 'read', description: 'Ver usuarios', sortOrder: 20 },
      { moduleKey: 'users', actionKey: 'update', description: 'Actualizar usuarios', sortOrder: 30 },
      { moduleKey: 'users', actionKey: 'delete', description: 'Eliminar usuarios', sortOrder: 40 },

      // DocumentTypes (según tu controller actual)
      { moduleKey: 'document-type', actionKey: 'create', description: 'Crear tipos de documento', sortOrder: 10 },
      { moduleKey: 'document-type', actionKey: 'read', description: 'Ver tipos de documento', sortOrder: 20 },
      { moduleKey: 'document-type', actionKey: 'update', description: 'Actualizar tipos de documento', sortOrder: 30 },
      { moduleKey: 'document-type', actionKey: 'delete', description: 'Eliminar tipo de documento', sortOrder: 40 },
      { moduleKey: 'document-type', actionKey: 'restore', description: 'Restaurar tipo de documento', sortOrder: 50 },
      { moduleKey: 'document-type', actionKey: 'bulk-delete', description: 'Eliminación masiva de tipos', sortOrder: 60 },
      { moduleKey: 'document-type', actionKey: 'bulk-restore', description: 'Restauración masiva de tipos', sortOrder: 70 },

      // Suppliers (ejemplo de los que ya tenías)
      { moduleKey: 'suppliers', actionKey: 'create', description: 'Crear proveedores', sortOrder: 10 },
      { moduleKey: 'suppliers', actionKey: 'view', description: 'Listar/ver proveedores', sortOrder: 20 },

      // Auditoría (demo; ajusta si lo implementas)
      { moduleKey: 'auditoria', actionKey: 'read', description: 'Ver auditoría', sortOrder: 10 },
      { moduleKey: 'auditoria', actionKey: 'delete', description: 'Eliminar eventos', sortOrder: 20 },

      //Business-partner (Socio de comercio)
      { moduleKey: 'business-partner', actionKey: 'create', description: 'Crear socios', sortOrder: 10 },
      { moduleKey: 'business-partner', actionKey: 'read', description: 'Ver socios', sortOrder: 20 },
      { moduleKey: 'business-partner', actionKey: 'update', description: 'Actualizar socios', sortOrder: 30 },
      { moduleKey: 'business-partner', actionKey: 'bulk-restore', description: 'Restaurar varios socios', sortOrder: 40 },
      { moduleKey: 'business-partner', actionKey: 'bulk-delete', description: 'Eliminar varios socios', sortOrder: 50 },
      { moduleKey: 'business-partner', actionKey: 'soft-delete', description: 'Eliminar un socio', sortOrder: 60 },
      { moduleKey: 'business-partner', actionKey: 'restore', description: 'Restaurar un socios', sortOrder: 70 },
    ];

    // 3) Sincronizar catálogo (módulos y permisos) SIEMPRE
    const allCodes = await this.syncCatalog(MODULES, PERMS);

    // 4) Asegurar rol admin y conceder todos los permisos del catálogo
    await this.ensureAdminRoleAndGrants(allCodes);

    // 5) Crear usuario admin si no hay usuarios
    await this.ensureDefaultAdminUser();

    this.log.log('Bootstrap OK (catálogo sincronizado, admin con permisos, usuario inicial si hacía falta).');
  }

  // ---------- helpers ----------

  /** Crea o restaura el DocumentType 'DNI' con los campos obligatorios actuales. */
  private async ensureDefaultDocumentType() {
    // Buscar incluyendo soft-deleted
    let dt = await this.docTypesRepo.findOne({ where: { name: 'DNI' }, withDeleted: true });
    if (!dt) {
      // Crear con campos requeridos
      dt = this.docTypesRepo.create({
        name: 'DNI',
        digits: 8,
        description: 'Documento Nacional de Identidad',
      });
      await this.docTypesRepo.save(dt);
      this.log.log('DocumentType "DNI" creado.');
      return;
    }

    // Si estaba soft-deleted, restaurar
    if (dt.deletedAt) {
      dt.deletedAt = null;
      await this.docTypesRepo.save(dt);
      this.log.log('DocumentType "DNI" restaurado (soft-delete).');
    }
  }

  private async syncCatalog(MODULES: ModuleSeed[], PERMS: PermSeed[]) {
    return this.permModulesRepo.manager.transaction(async (em) => {
      const modRepo = em.getRepository(PermissionModule);
      const permRepo = em.getRepository(Permission);

      // --- módulos ---
      const existingMods = await modRepo.find();
      const byKey = new Map(existingMods.map(m => [m.moduleKey, m]));

      for (const m of MODULES) {
        const found = byKey.get(m.moduleKey);
        if (!found) {
          const created = modRepo.create({
            moduleKey: m.moduleKey,
            label: m.label,
            sortOrder: m.sortOrder ?? 0,
            icon: m.icon ?? null,
          });
          await modRepo.save(created);
          byKey.set(m.moduleKey, created);
          this.log.log(`+ módulo creado: ${m.moduleKey}`);
        } else {
          let dirty = false;
          if (found.label !== m.label) { found.label = m.label; dirty = true; }
          if ((found.sortOrder ?? 0) !== (m.sortOrder ?? 0)) { found.sortOrder = m.sortOrder ?? 0; dirty = true; }
          if ((found.icon ?? null) !== (m.icon ?? null)) { found.icon = m.icon ?? null; dirty = true; }
          if (dirty) {
            await modRepo.save(found);
            this.log.log(`~ módulo actualizado: ${m.moduleKey}`);
          }
        }
      }

      // --- permisos ---
      const all = await permRepo.find({ relations: { module: true } });
      const byCode = new Map(all.map(p => [p.code, p]));
      const allCodes: string[] = [];

      for (const p of PERMS) {
        const code = `${p.moduleKey}.${p.actionKey}`;
        allCodes.push(code);

        const mod = byKey.get(p.moduleKey);
        if (!mod) {
          this.log.warn(`(omitido) No existe módulo "${p.moduleKey}" para crear permiso ${code}`);
          continue;
        }

        const found = byCode.get(code);
        if (!found) {
          const created = permRepo.create({
            code,
            description: p.description,
            actionKey: p.actionKey,
            sortOrder: p.sortOrder ?? 0,
            module: mod,
          });
          await permRepo.save(created);
          this.log.log(`+ permiso creado: ${code}`);
        } else {
          let dirty = false;
          if (found.description !== p.description) { found.description = p.description; dirty = true; }
          if ((found.sortOrder ?? 0) !== (p.sortOrder ?? 0)) { found.sortOrder = p.sortOrder ?? 0; dirty = true; }
          if (found.actionKey !== p.actionKey) { found.actionKey = p.actionKey; dirty = true; }
          if (!found.module || found.module.moduleKey !== mod.moduleKey) { found.module = mod; dirty = true; }
          if (dirty) {
            await permRepo.save(found);
            this.log.log(`~ permiso actualizado: ${code}`);
          }
        }
      }

      return allCodes;
    });
  }

  private async ensureAdminRoleAndGrants(allCodes: string[]) {
    // rol admin (en minúscula para matchear tu @RolesDec('admin'))
    let adminRole = await this.rolesRepo.findOne({
      where: { name: 'admin' },
      relations: { permissions: true },
    });

    if (!adminRole) {
      adminRole = this.rolesRepo.create({ name: 'admin', permissions: [] });
    }

    const currentCodes = new Set((adminRole.permissions ?? []).map(p => p.code));
    const toFetch = allCodes.filter(c => !currentCodes.has(c));
    if (toFetch.length) {
      const newPerms = await this.permsRepo.find({ where: { code: In(toFetch) } });
      adminRole.permissions = [...(adminRole.permissions ?? []), ...newPerms];
      await this.rolesRepo.save(adminRole);
      this.log.log(`~ admin recibió ${newPerms.length} permisos nuevos.`);
    } else {
      // si el rol aún no existía, guardarlo
      if (!adminRole.id) {
        await this.rolesRepo.save(adminRole);
        this.log.log('Rol "admin" creado sin permisos nuevos que añadir.');
      }
    }
  }

  private async ensureDefaultAdminUser() {
    const usersCount = await this.usersRepo.count();
    if (usersCount > 0) {
      this.log.log('Usuarios existentes: no se creará usuario por defecto.');
      return;
    }

    const email = 'admin@test.com';
    const plainPwd = 'Admin123';
    const passwordHash = await bcrypt.hash(plainPwd, 10);

    // rol admin
    let adminRole = await this.rolesRepo.findOne({ where: { name: 'admin' } });
    if (!adminRole) {
      adminRole = this.rolesRepo.create({ name: 'admin' });
      adminRole = await this.rolesRepo.save(adminRole);
    }

    // document type por defecto (ya asegurado arriba)
    const defaultDt = await this.docTypesRepo.findOne({ where: { name: 'DNI' } });

    const adminUser = this.usersRepo.create({
      email,
      name: 'Administrador',
      passwordHash,
      roles: [adminRole],
      isActive: true,
      documentType: defaultDt!,    // seguro existe tras ensureDefaultDocumentType()
      documentNumber: '00000000',
      phone: '999999999',
    });

    await this.usersRepo.save(adminUser);
    this.log.log(`Usuario inicial creado → ${email} / ${plainPwd}`);
  }
}
