// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { createTypeOrmOptions } from './database/typeorm-options';
import { HealthModule } from './health/health.module';

// Importa tus modulos reales
// Ejemplo de otros modulos (desactivalos si aun no existen)
// import { SalesModule } from './sales/sales.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { KeysModule } from './keys/keys.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { RbacModule } from './rbac/rbac.module';
import { SessionsModule } from './sessions/sessions.module';
import { DocumentTypesModule } from './catalogs/document-types/document-types.module';

import { BootstrapModule } from './bootstrap/bootstrap.module';
import { UserPermissionsModule } from './users/user-permissions.module';
import { MailerModule } from './mailer/mailer.module';
import { ClientModule } from './clients/client.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PricingModule } from './pricing/pricing.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { ServiceOrderAgreementsModule } from './service-orders/service-agreements/service-agreements.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SupplierModule } from './suppliers/supplier.module';
import { BusinessProfileModule } from './business-profile/business-profile.module';
import { ElectronicBillingModule } from './electronic-billing/electronic-billing.module';
import { MailSettingsModule } from './mail-settings/mail-settings.module';
import { WarrantiesModule } from './warranties/warranties.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => createTypeOrmOptions(process.env),
    }),
    ScheduleModule.forRoot(),

    // Tus modulos
    AuthModule,
    AuditModule,
    KeysModule,
    UsersModule,
    RolesModule,
    RbacModule,
    SessionsModule,
    BootstrapModule,
    UserPermissionsModule,
    MailerModule,
    MailSettingsModule,
    DocumentTypesModule,
    ClientModule,
    SupplierModule,
    InventoryModule,
    ServiceOrdersModule,
    ServiceOrderAgreementsModule,
    PricingModule,
    SalesModule,
    HealthModule,
    BusinessProfileModule,
    ElectronicBillingModule,
    WarrantiesModule,
  ],
})
export class AppModule {}
