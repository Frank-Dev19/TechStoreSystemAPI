import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/roles/entities/permission.entity';
import { PermissionModule } from 'src/roles/entities/permission-module.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { ServiceCategory } from 'src/service-catalog/entities/service-category.entity';
import { Service } from 'src/service-catalog/entities/service.entity';

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
    @InjectRepository(ServiceCategory) private readonly serviceCategoryRepo: Repository<ServiceCategory>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
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
      { moduleKey: 'clients', label: 'Clientes', sortOrder: 30, icon: 'fas fa-user-friends' },
      { moduleKey: 'suppliers', label: 'Proveedores', sortOrder: 35, icon: 'fas fa-truck' },
      { moduleKey: 'auditoria', label: 'Auditoría', sortOrder: 90, icon: 'fas fa-history' },
      { moduleKey: 'service-category', label: 'Categorías de Servicios', sortOrder: 105, icon: 'fas fa-spa' },
      { moduleKey: 'service', label: 'Servicios', sortOrder: 110, icon: 'fas fa-spa' },
      { moduleKey: 'service-order', label: 'Órdenes de Servicio', sortOrder: 115, icon: 'fas fa-clipboard-list' },
      { moduleKey: 'service-order-item', label: 'Equipos en Orden de Servicio', sortOrder: 116, icon: 'fas fa-tools' },
      { moduleKey: 'service-order-diagnosis', label: 'Diagnósticos de Orden de Servicio', sortOrder: 117, icon: 'fas fa-stethoscope' },
      { moduleKey: 'service-order-quote', label: 'Cotizaciones de Orden de Servicio', sortOrder: 118, icon: 'fas fa-file-invoice-dollar' },
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

      // Clients
      { moduleKey: 'clients', actionKey: 'create', description: 'Crear clientes', sortOrder: 10 },
      { moduleKey: 'clients', actionKey: 'read', description: 'Ver clientes', sortOrder: 20 },
      { moduleKey: 'clients', actionKey: 'update', description: 'Actualizar clientes', sortOrder: 30 },
      { moduleKey: 'clients', actionKey: 'delete', description: 'Eliminar un cliente', sortOrder: 60 },
      { moduleKey: 'clients', actionKey: 'restore', description: 'Restaurar un cliente', sortOrder: 70 },

      // Suppliers
      { moduleKey: 'suppliers', actionKey: 'create', description: 'Crear proveedores', sortOrder: 10 },
      { moduleKey: 'suppliers', actionKey: 'read', description: 'Ver proveedores', sortOrder: 20 },
      { moduleKey: 'suppliers', actionKey: 'update', description: 'Actualizar proveedores', sortOrder: 30 },
      { moduleKey: 'suppliers', actionKey: 'delete', description: 'Eliminar un proveedor', sortOrder: 60 },
      { moduleKey: 'suppliers', actionKey: 'restore', description: 'Restaurar un proveedor', sortOrder: 70 },

      // Auditoría (demo; ajusta si lo implementas)
      { moduleKey: 'auditoria', actionKey: 'read', description: 'Ver auditoría', sortOrder: 10 },
      { moduleKey: 'auditoria', actionKey: 'delete', description: 'Eliminar eventos', sortOrder: 20 },
      { moduleKey: 'auditoria', actionKey: 'stream', description: 'Ver eventos en vivo', sortOrder: 30 },

      //Service Category (Categorías de servicios)
      { moduleKey: 'service-category', actionKey: 'create', description: 'Crear categorías de servicios', sortOrder: 10 },
      { moduleKey: 'service-category', actionKey: 'read', description: 'Ver categorías de servicios', sortOrder: 20 },
      { moduleKey: 'service-category', actionKey: 'update', description: 'Actualizar categorías de servicios', sortOrder: 30 },
      { moduleKey: 'service-category', actionKey: 'delete', description: 'Eliminar categorías de servicios', sortOrder: 60 },
      { moduleKey: 'service-category', actionKey: 'restore', description: 'Restaurar categorías de servicios', sortOrder: 70 },

      //Service (Servicios)
      { moduleKey: 'service', actionKey: 'create', description: 'Crear servicios', sortOrder: 10 },
      { moduleKey: 'service', actionKey: 'read', description: 'Ver servicios', sortOrder: 20 },
      { moduleKey: 'service', actionKey: 'update', description: 'Actualizar servicios', sortOrder: 30 },
      { moduleKey: 'service', actionKey: 'delete', description: 'Eliminar servicios', sortOrder: 60 },
      { moduleKey: 'service', actionKey: 'restore', description: 'Restaurar servicios', sortOrder: 70 },

      // Service Orders
      { moduleKey: 'service-order', actionKey: 'create', description: 'Crear órdenes de servicio', sortOrder: 10 },
      { moduleKey: 'service-order', actionKey: 'read', description: 'Ver órdenes de servicio', sortOrder: 20 },
      { moduleKey: 'service-order', actionKey: 'update', description: 'Actualizar órdenes de servicio', sortOrder: 30 },
      { moduleKey: 'service-order', actionKey: 'delete', description: 'Eliminar órdenes de servicio', sortOrder: 60 },
      { moduleKey: 'service-order', actionKey: 'restore', description: 'Restaurar órdenes de servicio', sortOrder: 70 },

      // Service Order Items
      { moduleKey: 'service-order-item', actionKey: 'create', description: 'Crear equipos en órdenes de servicio', sortOrder: 10 },
      { moduleKey: 'service-order-item', actionKey: 'read', description: 'Ver equipos en órdenes de servicio', sortOrder: 20 },
      { moduleKey: 'service-order-item', actionKey: 'update', description: 'Actualizar equipos en órdenes de servicio', sortOrder: 30 },
      { moduleKey: 'service-order-item', actionKey: 'delete', description: 'Eliminar equipos en órdenes de servicio', sortOrder: 60 },
      { moduleKey: 'service-order-item', actionKey: 'restore', description: 'Restaurar equipos en órdenes de servicio', sortOrder: 70 },
      { moduleKey: 'service-order-item', actionKey: 'assign', description: 'Asignar o reasignar técnicos a equipos', sortOrder: 80 },
      { moduleKey: 'service-order-item', actionKey: 'update-status', description: 'Cambiar estado de equipos en órdenes de servicio', sortOrder: 90 },

      // Service Order Diagnoses
      { moduleKey: 'service-order-diagnosis', actionKey: 'create', description: 'Crear diagnósticos de órdenes de servicio', sortOrder: 10 },
      { moduleKey: 'service-order-diagnosis', actionKey: 'read', description: 'Ver diagnósticos de órdenes de servicio', sortOrder: 20 },
      { moduleKey: 'service-order-diagnosis', actionKey: 'update', description: 'Actualizar diagnósticos de órdenes de servicio', sortOrder: 30 },
      { moduleKey: 'service-order-diagnosis', actionKey: 'delete', description: 'Eliminar diagnósticos de órdenes de servicio', sortOrder: 60 },
      { moduleKey: 'service-order-diagnosis', actionKey: 'restore', description: 'Restaurar diagnósticos de órdenes de servicio', sortOrder: 70 },

      // Service Order Quotes
      { moduleKey: 'service-order-quote', actionKey: 'create', description: 'Crear cotizaciones de órdenes de servicio', sortOrder: 10 },
      { moduleKey: 'service-order-quote', actionKey: 'read', description: 'Ver cotizaciones de órdenes de servicio', sortOrder: 20 },
      { moduleKey: 'service-order-quote', actionKey: 'update', description: 'Actualizar cotizaciones de órdenes de servicio', sortOrder: 30 },
      { moduleKey: 'service-order-quote', actionKey: 'delete', description: 'Eliminar cotizaciones de órdenes de servicio', sortOrder: 60 },
      { moduleKey: 'service-order-quote', actionKey: 'restore', description: 'Restaurar cotizaciones de órdenes de servicio', sortOrder: 70 },
      { moduleKey: 'service-order-quote', actionKey: 'send-to-client', description: 'Enviar cotizaciones al cliente', sortOrder: 80 },
      { moduleKey: 'service-order-quote', actionKey: 'approve-client', description: 'Registrar aprobación de cotización por cliente', sortOrder: 90 },
      { moduleKey: 'service-order-quote', actionKey: 'reject-client', description: 'Registrar rechazo de cotización por cliente', sortOrder: 100 },
      { moduleKey: 'service-order-quote', actionKey: 'resubmit', description: 'Reenviar cotizaciones ajustadas', sortOrder: 110 },
    ];

    // 3) Sincronizar catálogo (módulos y permisos) SIEMPRE
    const allCodes = await this.syncCatalog(MODULES, PERMS);

    // 3.1) Eliminar permisos legacy bulk-* que ya no forman parte del modelo RBAC.
    await this.removeLegacyBulkPermissions();

    // 3.2) Asegurar roles operativos y sus permisos base.
    await this.ensureOperationalRolesAndGrants();

    // 4) Asegurar rol admin y conceder todos los permisos del catálogo
    await this.ensureAdminRoleAndGrants(allCodes);

    // 5) Crear usuario admin si no hay usuarios
    await this.ensureDefaultAdminUser();

    // 6) Asegurar servicio de diagnóstico
    await this.ensureDiagnosticServiceCatalog();

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

  private async ensureDiagnosticServiceCatalog() {
    const categoryCode = 'SC-000001';
    const serviceCode = 'DIAGNOSIS_FEE';
    const price = 30;

    let category = await this.serviceCategoryRepo.findOne({
      where: { code: categoryCode },
      withDeleted: true,
    });
    if (!category) {
      category = this.serviceCategoryRepo.create({
        code: categoryCode,
        name: 'Diagnostico',
        description: 'Servicios de diagnóstico',
        isActive: true,
      });
      await this.serviceCategoryRepo.save(category);
      this.log.log(`ServiceCategory "${categoryCode}" creada.`);
    } else if (category.deletedAt) {
      category.deletedAt = null;
      category.isActive = true;
      await this.serviceCategoryRepo.save(category);
      this.log.log(`ServiceCategory "${categoryCode}" restaurada.`);
    }

    let service = await this.serviceRepo.findOne({
      where: { code: serviceCode },
      withDeleted: true,
    });
    if (!service) {
      service = this.serviceRepo.create({
        code: serviceCode,
        name: 'Servicio de Diagnóstico',
        description: 'Costo base por diagnóstico',
        categoryId: category.id,
        price,
        estimatedDurationMinutes: 60,
        warrantyDays: 0,
        isActive: true,
      });
      await this.serviceRepo.save(service);
      this.log.log(`Service "${serviceCode}" creado.`);
    } else if (service.deletedAt) {
      service.deletedAt = null;
      service.isActive = true;
      await this.serviceRepo.save(service);
      this.log.log(`Service "${serviceCode}" restaurado.`);
    } else if (service.price !== price) {
      service.price = price;
      await this.serviceRepo.save(service);
      this.log.log(`Service "${serviceCode}" actualizado con precio ${price}.`);
    }
  }

  private async removeLegacyBulkPermissions() {
    const legacyCodes = [
      'document-type.bulk-delete',
      'document-type.bulk-restore',
      'clients.bulk-delete',
      'clients.bulk-restore',
      'suppliers.bulk-delete',
      'suppliers.bulk-restore',
      'ticket.create',
      'ticket.read',
      'ticket.update',
      'ticket.delete',
      'ticket.restore',
      'ticket-item.create',
      'ticket-item.read',
      'ticket-item.update',
      'ticket-item.delete',
      'ticket-item.restore',
      'ticket-item.assign',
      'ticket-item.assign-supervisor',
      'ticket-item.update-status',
      'diagnostic.create',
      'diagnostic.read',
      'diagnostic.update',
      'diagnostic.delete',
      'diagnostic.restore',
      'quote.create',
      'quote.read',
      'quote.update',
      'quote.delete',
      'quote.restore',
      'quote.send-to-client',
      'quote.approve-client',
      'quote.reject-client',
      'quote.resubmit',
      'service-order-item.assign-supervisor',
      'service-order-quote.approve-supervisor',
      'service-order-quote.reject-supervisor',
    ];

    const legacyPermissions = await this.permsRepo.find({
      where: { code: In(legacyCodes) },
    });

    if (!legacyPermissions.length) {
      return;
    }

    const legacySet = new Set(legacyPermissions.map((permission) => permission.code));
    const roles = await this.rolesRepo.find({ relations: { permissions: true } });

    for (const role of roles) {
      const filteredPermissions = (role.permissions ?? []).filter(
        (permission) => !legacySet.has(permission.code),
      );

      if (filteredPermissions.length !== (role.permissions ?? []).length) {
        role.permissions = filteredPermissions;
        await this.rolesRepo.save(role);
      }
    }

    await this.permsRepo.remove(legacyPermissions);
    this.log.log(`Permisos legacy eliminados: ${legacyCodes.join(', ')}`);
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

  private async ensureOperationalRolesAndGrants() {
    const roleSeeds: Array<{ name: string; permissionCodes: string[] }> = [
      {
        name: 'recepcionist',
        permissionCodes: [
          'service-order.create',
          'service-order.read',
          'service-order.update',
          'service-order-item.read',
          'service-order-item.assign',
          'service-order-item.update-status',
          'service-order-diagnosis.read',
          'service-order-quote.create',
          'service-order-quote.read',
          'service-order-quote.update',
          'service-order-quote.send-to-client',
          'service-order-quote.approve-client',
          'service-order-quote.reject-client',
          'service-order-quote.resubmit',
        ],
      },
      {
        name: 'technician',
        permissionCodes: [
          'service-order-item.read',
          'service-order-item.update-status',
          'service-order-diagnosis.create',
          'service-order-diagnosis.read',
          'service-order-diagnosis.update',
          'service-order-quote.read',
        ],
      },
      {
        name: 'supervisor',
        permissionCodes: [
          'service-order.read',
          'service-order-item.read',
          'service-order-diagnosis.read',
          'service-order-quote.read',
        ],
      },
    ];

    for (const seed of roleSeeds) {
      let role = await this.rolesRepo.findOne({
        where: { name: seed.name },
        relations: { permissions: true },
      });

      if (!role) {
        role = this.rolesRepo.create({ name: seed.name, permissions: [] });
      }

      const grantedCodes = new Set((role.permissions ?? []).map((permission) => permission.code));
      const missingCodes = seed.permissionCodes.filter((code) => !grantedCodes.has(code));

      if (missingCodes.length) {
        const permissions = await this.permsRepo.find({ where: { code: In(missingCodes) } });
        role.permissions = [...(role.permissions ?? []), ...permissions];
      }

      await this.rolesRepo.save(role);
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
