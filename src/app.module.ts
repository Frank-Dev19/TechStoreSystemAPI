// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Importa tus módulos reales
import { SuppliersModule } from './suppliers/suppliers.module';
// Ejemplo de otros módulos (desactívalos si aún no existen)
// import { SalesModule } from './sales/sales.module';

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
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          autoLoadEntities: true,
          logging: config.get<string>('DB_LOGGING') === 'true',
          // Opcional pero recomendable:
          timezone: 'Z',
          charset: 'utf8mb4',
        };
        if (isProd) {
          // Un solo env var en prod
          const url = config.get<string>('DATABASE_URL');
          if (!url) throw new Error('DATABASE_URL no definido en producción');
          return {
            ...common,
            url,
            // Algunos proveedores requieren SSL; ajusta según tu servicio:
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
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
          synchronize: true, // solo mientras modelas; luego pásalo a false + migrations
        };
      },
    }),

    // Tus módulos
    SuppliersModule
    // SalesModule,
  ],
})
export class AppModule { }
