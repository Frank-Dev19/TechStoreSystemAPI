import { createTypeOrmOptions } from './typeorm-options';

describe('createTypeOrmOptions', () => {
  it('requires DATABASE_URL in production', () => {
    expect(() => createTypeOrmOptions({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL is required in production',
    );
  });

  it('keeps synchronization and automatic migrations disabled in production', () => {
    const options = createTypeOrmOptions({
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@mysql:3306/techstore',
    });

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.migrationsTableName).toBe('typeorm_migrations');
  });

  it('enables synchronization for local disposable databases', () => {
    const options = createTypeOrmOptions({
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'password',
      DB_NAME: 'techstore',
    });

    expect(options.synchronize).toBe(true);
    expect(options.migrationsRun).toBe(false);
  });

  it('loads timestamped migrations without including Jest spec files', () => {
    const options = createTypeOrmOptions({
      DB_HOST: 'localhost',
      DB_NAME: 'techstore',
    });

    expect(options.migrations).toEqual([
      expect.stringContaining('!(*.spec).{ts,js}'),
    ]);
  });

  it('rejects synchronization in production', () => {
    expect(() =>
      createTypeOrmOptions({
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://user:password@mysql:3306/techstore',
        DB_SYNCHRONIZE: 'true',
      }),
    ).toThrow('DB_SYNCHRONIZE cannot be enabled in production');
  });

  it('supports the existing SSL compatibility switch', () => {
    const options = createTypeOrmOptions({
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://user:password@mysql:3306/techstore',
      DB_SSL: 'true',
    });

    expect((options as { ssl?: unknown }).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });
});
