// src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Importa tus mÃ³dulos reales
// Ejemplo de otros mÃ³dulos (desactÃ­valos si aÃºn no existen)
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
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { ServiceOrderAgreementsModule } from './service-orders/service-agreements/service-agreements.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SupplierModule } from './suppliers/supplier.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const common = {
          type: 'mysql' as const,
          entities: [__dirname + '/**/*.entity.{ts,js}'],
          autoLoadEntities: true,
          logging: config.get<string>('DB_LOGGING') === 'true',
          // Opcional pero recomendable:
          timezone: '-05:00',
          charset: 'utf8mb4',
        };
        if (isProd) {
          // Un solo env var en prod
          const url = config.get<string>('DATABASE_URL');
          if (!url) throw new Error('DATABASE_URL no definido en producciÃ³n');
          return {
            ...common,
            url,
            // Algunos proveedores requieren SSL; ajusta segÃºn tu servicio:
            ssl:
              process.env.DB_SSL === 'true'
                ? { rejectUnauthorized: false }
                : undefined,
            synchronize: false, // NUNCA en prod
          };
        }
        // Local: campos sueltos
        return {
          ...common,
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT', 3306),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          synchronize: true, // solo mientras modelas; luego pÃ¡salo a false + migrations
        };
      },
    }),
    ScheduleModule.forRoot(),

    // Tus mÃ³dulos
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
    UserPermissionsModule,
    DocumentTypesModule,
    ClientModule,
    SupplierModule,
    InventoryModule,
    ServiceCatalogModule,
    ServiceOrdersModule,
    ServiceOrderAgreementsModule,
    PricingModule,
    SalesModule,
  ],
})
export class AppModule {}

