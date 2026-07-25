import path from 'node:path';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

type Environment = Record<string, string | undefined>;

export function createTypeOrmOptions(
  env: Environment = process.env,
): TypeOrmModuleOptions {
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction && env.DB_SYNCHRONIZE === 'true') {
    throw new Error('DB_SYNCHRONIZE cannot be enabled in production');
  }
  if (isProduction && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }

  const common: TypeOrmModuleOptions = {
    type: 'mysql',
    entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    synchronize: !isProduction,
    migrationsRun: false,
    logging: env.DB_LOGGING === 'true',
    timezone: '-05:00',
    charset: 'utf8mb4',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    autoLoadEntities: true,
  };

  if (isProduction || env.DATABASE_URL) {
    return { ...common, url: env.DATABASE_URL };
  }

  return {
    ...common,
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  };
}
