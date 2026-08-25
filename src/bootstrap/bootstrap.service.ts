import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/roles/entities/permission.entity';
import { PermissionModule } from 'src/roles/entities/permission-module.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { DocumentTypeKind } from 'src/catalogs/document-types/entities/document-type-kind.enum';

type ModuleSeed = {
  moduleKey: string;
  label: string;
  sortOrder: number;
  icon?: string | null;
};
type PermSeed = {
  moduleKey: string;
  actionKey: string;
  description: string;
  sortOrder?: number;
};

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly log = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permsRepo: Repository<Permission>,
    @InjectRepository(PermissionModule)
    private readonly permModulesRepo: Repository<PermissionModule>,
    @InjectRepository(DocumentType)
    private readonly docTypesRepo: Repository<DocumentType>,
  ) {}

  async onModuleInit() {
    // 0) Asegurar tipos de documento por defecto con soft delete considerado
    await this.ensureDefaultDocumentTypes();

    // 1) Catalogo de modulos (fuente de verdad)
    const MODULES: ModuleSeed[] = [
      {
        moduleKey: 'role',
        label: 'Roles',
        sortOrder: 10,
        icon: 'fas fa-shield-alt',
      },
      {
        moduleKey: 'keys',
        label: 'Claves de Operacion',
        sortOrder: 15,
        icon: 'fas fa-key',
      },
      {
        moduleKey: 'users',
        label: 'Usuarios',
        sortOrder: 20,
        icon: 'fas fa-users',
      },
      {
        moduleKey: 'document-type',
        label: 'Tipos de Documento',
        sortOrder: 25,
        icon: 'fas fa-id-card',
      },
      {
        moduleKey: 'clients',
        label: 'Clientes',
        sortOrder: 30,
        icon: 'fas fa-user-friends',
      },
      {
        moduleKey: 'suppliers',
        label: 'Proveedores',
        sortOrder: 35,
        icon: 'fas fa-truck',
      },
      {
        moduleKey: 'business-profile',
        label: 'Empresa Emisora',
        sortOrder: 40,
        icon: 'fas fa-building',
      },
      {
        moduleKey: 'auditoria',
        label: 'Auditoria',
        sortOrder: 90,
        icon: 'fas fa-history',
      },
      {
        moduleKey: 'service-order',
        label: 'Ordenes de Servicio',
        sortOrder: 115,
        icon: 'fas fa-clipboard-list',
      },
      {
        moduleKey: 'service-order-diagnosis',
        label: 'Diagnosticos de Orden de Servicio',
        sortOrder: 117,
        icon: 'fas fa-stethoscope',
      },
      {
        moduleKey: 'service-order-agreement',
        label: 'Cotizaciones de órdenes de servicio',
        sortOrder: 118,
        icon: 'fas fa-handshake',
      },
      {
        moduleKey: 'service-order-payment',
        label: 'Pagos de Orden de Servicio',
        sortOrder: 119,
        icon: 'fas fa-money-bill-wave',
      },
      {
        moduleKey: 'service-order-event',
        label: 'Historial de Orden de Servicio',
        sortOrder: 120,
        icon: 'fas fa-stream',
      },
      {
        moduleKey: 'service-order-inbox',
        label: 'Inbox de Orden de Servicio',
        sortOrder: 121,
        icon: 'fab fa-whatsapp',
      },
    ];

    // 2) Catalogo de permisos (fuente de verdad)
    const PERMS: PermSeed[] = [
      // Roles
      {
        moduleKey: 'role',
        actionKey: 'create',
        description: 'Crear roles',
        sortOrder: 10,
      },
      {
        moduleKey: 'role',
        actionKey: 'read',
        description: 'Listar/ver roles',
        sortOrder: 20,
      },
      {
        moduleKey: 'role',
        actionKey: 'update',
        description: 'Actualizar roles',
        sortOrder: 30,
      },
      {
        moduleKey: 'role',
        actionKey: 'delete',
        description: 'Eliminar roles',
        sortOrder: 40,
      },

      // Keys
      {
        moduleKey: 'keys',
        actionKey: 'manage',
        description: 'Crear/rotar claves de operacion',
        sortOrder: 10,
      },
      {
        moduleKey: 'keys',
        actionKey: 'view',
        description: 'Ver claves de operacion activas',
        sortOrder: 20,
      },

      // Users (si no los tenias antes en la tabla)
      {
        moduleKey: 'users',
        actionKey: 'create',
        description: 'Crear usuarios',
        sortOrder: 10,
      },
      {
        moduleKey: 'users',
        actionKey: 'read',
        description: 'Ver usuarios',
        sortOrder: 20,
      },
      {
        moduleKey: 'users',
        actionKey: 'update',
        description: 'Actualizar usuarios',
        sortOrder: 30,
      },
      {
        moduleKey: 'users',
        actionKey: 'delete',
        description: 'Eliminar usuarios',
        sortOrder: 40,
      },

      // DocumentTypes (segun tu controller actual)
      {
        moduleKey: 'document-type',
        actionKey: 'create',
        description: 'Crear tipos de documento',
        sortOrder: 10,
      },
      {
        moduleKey: 'document-type',
        actionKey: 'read',
        description: 'Ver tipos de documento',
        sortOrder: 20,
      },
      {
        moduleKey: 'document-type',
        actionKey: 'update',
        description: 'Actualizar tipos de documento',
        sortOrder: 30,
      },
      {
        moduleKey: 'document-type',
        actionKey: 'delete',
        description: 'Eliminar tipo de documento',
        sortOrder: 40,
      },
      {
        moduleKey: 'document-type',
        actionKey: 'restore',
        description: 'Restaurar tipo de documento',
        sortOrder: 50,
      },

      // Clients
      {
        moduleKey: 'clients',
        actionKey: 'create',
        description: 'Crear clientes',
        sortOrder: 10,
      },
      {
        moduleKey: 'clients',
        actionKey: 'read',
        description: 'Ver clientes',
        sortOrder: 20,
      },
      {
        moduleKey: 'clients',
        actionKey: 'update',
        description: 'Actualizar clientes',
        sortOrder: 30,
      },
      {
        moduleKey: 'clients',
        actionKey: 'import',
        description: 'Importar clientes desde Excel',
        sortOrder: 40,
      },
      {
        moduleKey: 'clients',
        actionKey: 'delete',
        description: 'Eliminar un cliente',
        sortOrder: 60,
      },
      {
        moduleKey: 'clients',
        actionKey: 'restore',
        description: 'Restaurar un cliente',
        sortOrder: 70,
      },

      // Suppliers
      {
        moduleKey: 'suppliers',
        actionKey: 'create',
        description: 'Crear proveedores',
        sortOrder: 10,
      },
      {
        moduleKey: 'suppliers',
        actionKey: 'read',
        description: 'Ver proveedores',
        sortOrder: 20,
      },
      {
        moduleKey: 'suppliers',
        actionKey: 'update',
        description: 'Actualizar proveedores',
        sortOrder: 30,
      },
      {
        moduleKey: 'suppliers',
        actionKey: 'delete',
        description: 'Eliminar un proveedor',
        sortOrder: 60,
      },
      {
        moduleKey: 'suppliers',
        actionKey: 'restore',
        description: 'Restaurar un proveedor',
        sortOrder: 70,
      },

      // Business profile
      {
        moduleKey: 'business-profile',
        actionKey: 'read',
        description: 'Ver datos de empresa emisora',
        sortOrder: 10,
      },
      {
        moduleKey: 'business-profile',
        actionKey: 'update',
        description: 'Actualizar datos de empresa emisora',
        sortOrder: 20,
      },

      // Auditoria (demo; ajusta si lo implementas)
      {
        moduleKey: 'auditoria',
        actionKey: 'read',
        description: 'Ver auditoria',
        sortOrder: 10,
      },
      {
        moduleKey: 'auditoria',
        actionKey: 'delete',
        description: 'Eliminar eventos',
        sortOrder: 20,
      },
      {
        moduleKey: 'auditoria',
        actionKey: 'stream',
        description: 'Ver eventos en vivo',
        sortOrder: 30,
      },

      // Service Orders
      {
        moduleKey: 'service-order',
        actionKey: 'create',
        description: 'Crear ordenes de servicio',
        sortOrder: 10,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'read',
        description: 'Ver ordenes de servicio',
        sortOrder: 20,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'update',
        description: 'Actualizar ordenes de servicio',
        sortOrder: 30,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'edit',
        description: 'Editar datos operativos de órdenes de servicio',
        sortOrder: 31,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'assign',
        description: 'Asignar técnicos a órdenes de servicio',
        sortOrder: 32,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'transition',
        description: 'Cambiar etapa técnica de órdenes de servicio',
        sortOrder: 33,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'item-transition',
        description: 'Cambiar etapa técnica de equipos de una orden',
        sortOrder: 34,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'deliver',
        description: 'Registrar entrega de órdenes de servicio',
        sortOrder: 35,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'item-deliver',
        description: 'Registrar entrega individual de equipos',
        sortOrder: 36,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'item-cancel',
        description: 'Registrar cancelaciones de equipos',
        sortOrder: 37,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'item-cancel-after-start',
        description: 'Resolver cancelaciones solicitadas después de iniciar el trabajo',
        sortOrder: 38,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'billing-link',
        description: 'Gestionar vínculos de facturación de órdenes',
        sortOrder: 36,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'delete',
        description: 'Eliminar ordenes de servicio',
        sortOrder: 60,
      },
      {
        moduleKey: 'service-order',
        actionKey: 'restore',
        description: 'Restaurar ordenes de servicio',
        sortOrder: 70,
      },

      // Service Order Diagnoses
      {
        moduleKey: 'service-order-diagnosis',
        actionKey: 'create',
        description: 'Crear diagnosticos de ordenes de servicio',
        sortOrder: 10,
      },
      {
        moduleKey: 'service-order-diagnosis',
        actionKey: 'read',
        description: 'Ver diagnosticos de ordenes de servicio',
        sortOrder: 20,
      },
      {
        moduleKey: 'service-order-diagnosis',
        actionKey: 'update',
        description: 'Actualizar diagnosticos de ordenes de servicio',
        sortOrder: 30,
      },
      {
        moduleKey: 'service-order-diagnosis',
        actionKey: 'delete',
        description: 'Eliminar diagnosticos de ordenes de servicio',
        sortOrder: 60,
      },
      {
        moduleKey: 'service-order-diagnosis',
        actionKey: 'restore',
        description: 'Restaurar diagnosticos de ordenes de servicio',
        sortOrder: 70,
      },

      // Service Order Agreements
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'create',
        description: 'Crear cotizaciones de órdenes de servicio',
        sortOrder: 10,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'read',
        description: 'Ver cotizaciones de órdenes de servicio',
        sortOrder: 20,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'update',
        description: 'Actualizar cotizaciones de órdenes de servicio',
        sortOrder: 30,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'delete',
        description: 'Eliminar cotizaciones de órdenes de servicio',
        sortOrder: 60,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'restore',
        description: 'Restaurar cotizaciones de órdenes de servicio',
        sortOrder: 70,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'confirm',
        description: 'Confirmar cotizaciones de órdenes de servicio',
        sortOrder: 80,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'void',
        description: 'Anular cotizaciones de órdenes de servicio',
        sortOrder: 90,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'record-client-decision',
        description: 'Registrar decisiones comerciales del cliente',
        sortOrder: 100,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'apply-discount',
        description: 'Aplicar descuentos dentro del límite comercial',
        sortOrder: 110,
      },
      {
        moduleKey: 'service-order-agreement',
        actionKey: 'override-discount-limit',
        description: 'Autorizar descuentos por encima del límite comercial',
        sortOrder: 120,
      },

      // Service Order Inbox
      {
        moduleKey: 'service-order-inbox',
        actionKey: 'read',
        description: 'Ver inbox de órdenes de servicio',
        sortOrder: 10,
      },
      {
        moduleKey: 'service-order-inbox',
        actionKey: 'send',
        description: 'Enviar mensajes en inbox de órdenes de servicio',
        sortOrder: 20,
      },

      // Service Order Payments
      {
        moduleKey: 'service-order-payment',
        actionKey: 'create',
        description: 'Registrar pagos de ordenes de servicio',
        sortOrder: 10,
      },
      {
        moduleKey: 'service-order-payment',
        actionKey: 'read',
        description: 'Ver pagos de ordenes de servicio',
        sortOrder: 20,
      },
      {
        moduleKey: 'service-order-payment',
        actionKey: 'update',
        description: 'Actualizar pagos de ordenes de servicio',
        sortOrder: 30,
      },
      {
        moduleKey: 'service-order-payment',
        actionKey: 'delete',
        description: 'Eliminar pagos de ordenes de servicio',
        sortOrder: 40,
      },
      {
        moduleKey: 'service-order-payment',
        actionKey: 'restore',
        description: 'Restaurar pagos de ordenes de servicio',
        sortOrder: 50,
      },
      {
        moduleKey: 'service-order-payment',
        actionKey: 'confirm',
        description: 'Confirmar pagos de ordenes de servicio',
        sortOrder: 60,
      },

      // Service Order Events
      {
        moduleKey: 'service-order-event',
        actionKey: 'read',
        description: 'Ver historial de ordenes de servicio',
        sortOrder: 10,
      },
    ];

    // 3) Sincronizar catalogo (modulos y permisos) SIEMPRE
    MODULES.push(
      { moduleKey: 'app', label: 'Acceso al sistema', sortOrder: 1, icon: 'fas fa-home' },
      { moduleKey: 'profile', label: 'Perfil propio', sortOrder: 2, icon: 'fas fa-user' },
      { moduleKey: 'navigation', label: 'Navegacion', sortOrder: 3, icon: 'fas fa-bars' },
      { moduleKey: 'sales', label: 'Ventas', sortOrder: 50, icon: 'fas fa-cash-register' },
      { moduleKey: 'cashflow', label: 'Caja', sortOrder: 51, icon: 'fas fa-wallet' },
      { moduleKey: 'document-series', label: 'Series de comprobantes', sortOrder: 52, icon: 'fas fa-hashtag' },
      { moduleKey: 'electronic-billing', label: 'Facturacion electronica', sortOrder: 53, icon: 'fas fa-file-invoice' },
      { moduleKey: 'mail-settings', label: 'Configuracion de correo', sortOrder: 54, icon: 'fas fa-envelope' },
      { moduleKey: 'inventory-kardex', label: 'Kardex', sortOrder: 60, icon: 'fas fa-book' },
      { moduleKey: 'inventory-products', label: 'Productos de inventario', sortOrder: 61, icon: 'fas fa-box' },
      { moduleKey: 'inventory-stock', label: 'Stock', sortOrder: 62, icon: 'fas fa-boxes' },
      { moduleKey: 'inventory-serials', label: 'Seriales', sortOrder: 63, icon: 'fas fa-barcode' },
      { moduleKey: 'inventory-manage', label: 'Gestion de inventario', sortOrder: 64, icon: 'fas fa-warehouse' },
      { moduleKey: 'pricing', label: 'Precios', sortOrder: 70, icon: 'fas fa-tags' },
    );
    const add = (moduleKey: string, actionKey: string, description: string, sortOrder = 10) =>
      PERMS.push({ moduleKey, actionKey, description, sortOrder });
    add('app', 'home', 'Acceder al inicio');
    add('profile', 'manage-own', 'Ver y editar el perfil propio');
    add('navigation', 'admin', 'Acceder a administracion');
    add('navigation', 'mail-settings', 'Acceder a configuracion de correo');
    add('navigation', 'clients', 'Acceder a clientes');
    add('navigation', 'document-types', 'Acceder a tipos de documento');
    add('navigation', 'suppliers', 'Acceder a proveedores');
    add('navigation', 'sales', 'Acceder a ventas');
    add('navigation', 'inventory-kardex', 'Acceder unicamente al Kardex');
    add('navigation', 'inventory-manage', 'Acceder a la gestion completa de inventario');
    add('navigation', 'reception', 'Acceder al panel de recepcion');
    add('navigation', 'technician', 'Acceder al panel tecnico');
    add('navigation', 'inbox', 'Acceder a mensajeria');
    for (const action of ['read', 'simulate', 'create', 'update', 'cancel']) add('sales', action, `${action} ventas`);
    for (const action of ['read', 'manage', 'reports']) add('cashflow', action, `${action} caja`);
    for (const action of ['read', 'manage']) add('document-series', action, `${action} series`);
    for (const action of ['read', 'send', 'download', 'email']) add('electronic-billing', action, `${action} comprobantes electronicos`);
    add('mail-settings', 'read', 'Ver configuracion de correo', 10);
    add('mail-settings', 'update', 'Actualizar configuracion de correo', 20);
    add('mail-settings', 'test', 'Probar configuracion de correo', 30);
    add('inventory-kardex', 'read', 'Consultar Kardex');
    for (const action of ['read', 'manage']) add('inventory-products', action, `${action} productos`);
    add('inventory-stock', 'read', 'Consultar stock');
    for (const action of ['read', 'manage']) add('inventory-serials', action, `${action} seriales`);
    for (const action of ['read', 'manage']) add('inventory-manage', action, `${action} inventario`);
    for (const action of ['read', 'manage']) add('pricing', action, `${action} precios`);

    const allCodes = await this.syncCatalog(MODULES, PERMS);

    // 3.1) Eliminar permisos legacy bulk-* que ya no forman parte del modelo RBAC.
    await this.removeLegacyBulkPermissions();

    // 3.2) Asegurar roles operativos y sus permisos base.
    await this.ensureOperationalRolesAndGrants();

    // 4) Asegurar rol admin y conceder todos los permisos del catalogo
    await this.ensureAdminRoleAndGrants(allCodes);

    // 5) Crear/asegurar usuarios base
    await this.ensureDefaultUsers();
    await this.ensureOperationalUsers();

    this.log.log(
      'Bootstrap OK (catalogo sincronizado, admin con permisos, usuario inicial si hacia falta).',
    );
  }

  // ---------- helpers ----------

  private async ensureDefaultDocumentTypes() {
    await this.ensureDocumentType(
      'DNI',
      8,
      'Documento Nacional de Identidad',
      '1',
      DocumentTypeKind.PERSON,
    );
    await this.ensureDocumentType(
      'Carnet de Extranjeria',
      12,
      'Carnet de Extranjeria',
      '4',
      DocumentTypeKind.PERSON,
    );
    await this.ensureDocumentType(
      'RUC',
      11,
      'Registro Único de Contribuyentes',
      '6',
      DocumentTypeKind.COMPANY,
    );
    await this.ensureDocumentType(
      'Pasaporte',
      12,
      'Pasaporte',
      '7',
      DocumentTypeKind.PERSON,
    );
    await this.ensureDocumentType(
      'Cedula Diplomatica',
      15,
      'Cedula Diplomatica de Identidad',
      'A',
      DocumentTypeKind.PERSON,
    );
  }

  private async ensureDocumentType(
    name: string,
    digits: number,
    description: string,
    sunatCode?: string,
    kind?: DocumentTypeKind,
  ) {
    let dt = await this.docTypesRepo.findOne({
      where: { name },
      withDeleted: true,
    });
    if (!dt) {
      dt = this.docTypesRepo.create({
        name,
        digits,
        description,
        sunatCode,
        kind,
      });
      await this.docTypesRepo.save(dt);
      this.log.log(`DocumentType "${name}" creado.`);
      return;
    }

    let dirty = false;
    if (dt.deletedAt) {
      dt.deletedAt = null;
      dirty = true;
    }
    if (dt.digits !== digits) {
      dt.digits = digits;
      dirty = true;
    }
    if (dt.description !== description) {
      dt.description = description;
      dirty = true;
    }
    if (sunatCode && dt.sunatCode !== sunatCode) {
      dt.sunatCode = sunatCode;
      dirty = true;
    }
    if (kind && dt.kind !== kind) {
      dt.kind = kind;
      dirty = true;
    }

    if (dirty) {
      await this.docTypesRepo.save(dt);
      this.log.log(`DocumentType "${name}" actualizado/restaurado.`);
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
      'service-order-item.create',
      'service-order-item.read',
      'service-order-item.update',
      'service-order-item.delete',
      'service-order-item.restore',
      'service-order-item.assign',
      'service-order-item.update-status',
      'service-order-item.assign-supervisor',
      'service-order-quote.create',
      'service-order-quote.read',
      'service-order-quote.update',
      'service-order-quote.delete',
      'service-order-quote.restore',
      'service-order-quote.approve-client',
      'service-order-quote.reject-client',
      'service-order-quote.resubmit',
      'service-order-quote.approve-supervisor',
      'service-order-quote.reject-supervisor',
    ];

    const legacyPermissions = await this.permsRepo.find({
      where: { code: In(legacyCodes) },
    });

    if (!legacyPermissions.length) {
      return;
    }

    const legacySet = new Set(
      legacyPermissions.map((permission) => permission.code),
    );
    const roles = await this.rolesRepo.find({
      relations: { permissions: true },
    });

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

    const legacyModule = await this.permModulesRepo.findOne({
      where: { moduleKey: 'service-order-item' },
    });

    if (legacyModule) {
      await this.permModulesRepo.remove(legacyModule);
      this.log.log('Modulo legacy eliminado: service-order-item');
    }
  }

  private async syncCatalog(MODULES: ModuleSeed[], PERMS: PermSeed[]) {
    return this.permModulesRepo.manager.transaction(async (em) => {
      const modRepo = em.getRepository(PermissionModule);
      const permRepo = em.getRepository(Permission);

      // --- modulos ---
      const existingMods = await modRepo.find();
      const byKey = new Map(existingMods.map((m) => [m.moduleKey, m]));

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
          this.log.log(`+ modulo creado: ${m.moduleKey}`);
        } else {
          let dirty = false;
          if (found.label !== m.label) {
            found.label = m.label;
            dirty = true;
          }
          if ((found.sortOrder ?? 0) !== (m.sortOrder ?? 0)) {
            found.sortOrder = m.sortOrder ?? 0;
            dirty = true;
          }
          if ((found.icon ?? null) !== (m.icon ?? null)) {
            found.icon = m.icon ?? null;
            dirty = true;
          }
          if (dirty) {
            await modRepo.save(found);
            this.log.log(`~ modulo actualizado: ${m.moduleKey}`);
          }
        }
      }

      // --- permisos ---
      const all = await permRepo.find({ relations: { module: true } });
      const byCode = new Map(all.map((p) => [p.code, p]));
      const allCodes: string[] = [];

      for (const p of PERMS) {
        const code = `${p.moduleKey}.${p.actionKey}`;
        allCodes.push(code);

        const mod = byKey.get(p.moduleKey);
        if (!mod) {
          this.log.warn(
            `(omitido) No existe modulo "${p.moduleKey}" para crear permiso ${code}`,
          );
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
          if (found.description !== p.description) {
            found.description = p.description;
            dirty = true;
          }
          if ((found.sortOrder ?? 0) !== (p.sortOrder ?? 0)) {
            found.sortOrder = p.sortOrder ?? 0;
            dirty = true;
          }
          if (found.actionKey !== p.actionKey) {
            found.actionKey = p.actionKey;
            dirty = true;
          }
          if (!found.module || found.module.moduleKey !== mod.moduleKey) {
            found.module = mod;
            dirty = true;
          }
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
    // rol admin (en minuscula para matchear tu @RolesDec('admin'))
    let adminRole = await this.rolesRepo.findOne({
      where: { name: 'admin' },
      relations: { permissions: true },
    });

    if (!adminRole) {
      adminRole = this.rolesRepo.create({ name: 'admin', permissions: [] });
    }

    adminRole.permissions = await this.permsRepo.find({ where: { code: In(allCodes) } });
    await this.rolesRepo.save(adminRole);
    this.log.log(`~ rol admin sincronizado con ${adminRole.permissions.length} permisos.`);
  }

  private async ensureOperationalRolesAndGrants() {
    const roleSeeds: Array<{ name: string; permissionCodes: string[] }> = [
      {
        name: 'recepcionist',
        permissionCodes: [
          'app.home', 'profile.manage-own', 'navigation.clients',
          'navigation.document-types', 'navigation.suppliers', 'navigation.sales',
          'navigation.inventory-manage', 'navigation.reception', 'navigation.inbox',
          'document-type.create', 'document-type.read', 'document-type.update',
          'suppliers.create', 'suppliers.read', 'suppliers.update',
          'sales.read', 'sales.simulate', 'sales.create', 'sales.update', 'sales.cancel',
          'cashflow.read', 'cashflow.manage', 'cashflow.reports',
          'document-series.read', 'document-series.manage',
          'electronic-billing.read', 'electronic-billing.send',
          'electronic-billing.download', 'electronic-billing.email',
          'inventory-kardex.read',
          'inventory-products.read', 'inventory-products.manage',
          'inventory-stock.read',
          'inventory-serials.read', 'inventory-serials.manage',
          'inventory-manage.read', 'inventory-manage.manage',
          'pricing.read',
          'service-order.create',
          'service-order.read',
          'service-order.update',
          'service-order.edit',
          'service-order.assign',
          'service-order.transition',
          'service-order.item-transition',
          'service-order.deliver',
          'service-order.item-deliver',
          'service-order.item-cancel',
          'service-order.billing-link',
          'clients.read',
          'clients.create',
          'clients.update',
          'clients.import',
          'service-category.read',
          'service.read',
          'service-order-diagnosis.read',
          'service-order-agreement.create',
          'service-order-agreement.read',
          'service-order-agreement.update',
          'service-order-agreement.confirm',
          'service-order-agreement.void',
          'service-order-agreement.record-client-decision',
          'service-order-agreement.apply-discount',
          'service-order-inbox.read',
          'service-order-inbox.send',
          'service-order-payment.create',
          'service-order-payment.read',
        ],
      },
      {
        name: 'technician',
        permissionCodes: [
          'app.home', 'profile.manage-own', 'navigation.inventory-kardex',
          'navigation.technician', 'navigation.inbox', 'inventory-kardex.read',
          'inventory-products.read',
          'service-order.read',
          'service-order.update',
          'service-order.transition',
          'service-order.item-transition',
          'service-order.item-cancel',
          'service-order-diagnosis.create',
          'service-order-diagnosis.read',
          'service-order-diagnosis.update',
          'service-order-agreement.create',
          'service-order-agreement.update',
          'service-order-agreement.read',
          'service-order-agreement.confirm',
          'service-order-agreement.record-client-decision',
          'service-order-agreement.apply-discount',
          'service-order-inbox.read',
          'service-order-inbox.send',
        ],
      },
      {
        name: 'supervisor',
        permissionCodes: [
          'service-order.read',
          'service-order.assign',
          'service-order.transition',
          'service-order.item-transition',
          'service-order.item-cancel',
          'service-order.item-cancel-after-start',
          'service-order-diagnosis.read',
          'service-order-agreement.create',
          'service-order-agreement.read',
          'service-order-agreement.update',
          'service-order-agreement.record-client-decision',
          'service-order-agreement.apply-discount',
          'service-order-agreement.override-discount-limit',
          'service-order-payment.read',
          'service-order-event.read',
          'service-order-inbox.read',
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

      const seededPermissions = await this.permsRepo.find({
        where: { code: In(seed.permissionCodes) },
      });
      role.permissions = seed.name === 'supervisor'
        ? [
            ...(role.permissions ?? []),
            ...seededPermissions.filter(
              (permission) => !(role.permissions ?? []).some((current) => current.code === permission.code),
            ),
          ]
        : seededPermissions;
      await this.rolesRepo.save(role);
    }
  }

  private async ensureDefaultUsers() {
    const usersCount = await this.usersRepo.count();
    if (usersCount > 0) {
      this.log.log('Usuarios existentes: no se creara usuario por defecto.');
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
    const defaultDt = await this.docTypesRepo.findOne({
      where: { name: 'DNI' },
    });

    const adminUser = this.usersRepo.create({
      email,
      name: 'Administrador',
      passwordHash,
      roles: [adminRole],
      isActive: true,
      documentType: defaultDt!, // seguro existe tras ensureDefaultDocumentType()
      documentNumber: '00000000',
      phone: '999999999',
    });

    await this.usersRepo.save(adminUser);
    this.log.log(`Usuario inicial creado - ${email} / ${plainPwd}`);
  }
  private async ensureOperationalUsers() {
    const defaultDt = await this.docTypesRepo.findOne({
      where: { name: 'DNI' },
    });
    if (!defaultDt) {
      return;
    }

    const userSeeds = [
      {
        email: 'recepcionist@test.com',
        name: 'Recepcionista',
        password: 'Recepcion123',
        roleName: 'recepcionist',
        documentNumber: '00000001',
        phone: '999999991',
      },
      {
        email: 'technician@test.com',
        name: 'Tecnico',
        password: 'Technician123',
        roleName: 'technician',
        documentNumber: '00000002',
        phone: '999999992',
      },
    ];

    for (const seed of userSeeds) {
      const existingUser = await this.usersRepo.findOne({
        where: { email: seed.email },
        withDeleted: true,
      });

      if (existingUser) {
        continue;
      }

      const role = await this.rolesRepo.findOne({
        where: { name: seed.roleName },
      });
      if (!role) {
        this.log.warn(
          `No se pudo crear usuario ${seed.email}: rol ${seed.roleName} no encontrado.`,
        );
        continue;
      }

      const passwordHash = await bcrypt.hash(seed.password, 10);
      const user = this.usersRepo.create({
        email: seed.email,
        name: seed.name,
        passwordHash,
        roles: [role],
        isActive: true,
        documentType: defaultDt,
        documentNumber: seed.documentNumber,
        phone: seed.phone,
      });

      await this.usersRepo.save(user);
      this.log.log(`Usuario base creado -> ${seed.email} / ${seed.password}`);
    }
  }
}
