import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { NormalizePhoneColumnsToE16420260511110000 } from '../src/database/migrations/20260511110000-normalize-phone-columns-to-e164';

const isProd = process.env.NODE_ENV === 'production';

const dataSource = new DataSource({
  type: 'mysql',
  ...(isProd
    ? {
        url: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 3306),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }),
  migrations: [NormalizePhoneColumnsToE16420260511110000],
});

async function main() {
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    console.log('Phone normalization migration executed successfully.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
