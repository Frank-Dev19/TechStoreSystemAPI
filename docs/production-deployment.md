# Production deployment

The production database schema is managed only through versioned TypeORM migrations. Application startup never synchronizes the schema and never runs migrations automatically.

## Configuration

Set `NODE_ENV=production` and provide `DATABASE_URL` using a MySQL URL. Keep secrets in the deployment environment; do not commit an `.env` file. `DB_SSL=true` enables the compatibility SSL mode currently supported by the application. It uses `rejectUnauthorized: false`; replace it with a verified CA configuration when the database provider supplies one.

## Development workflow

Create an empty migration:

```powershell
npm run migration:create -- src/database/migrations/AddFeature
```

Generate a migration after changing entities:

```powershell
npm run migration:generate -- src/database/migrations/AddFeature
```

Review every generated `up` and `down` method before applying it. Then run or inspect migrations:

```powershell
npm run migration:show
npm run migration:run
npm run migration:revert
```

## Empty MySQL 8 validation

Use a disposable MySQL 8 instance with credentials created only for the test. Point `DATABASE_URL` at the empty database, run the migration twice, and confirm the second run reports no pending migrations. Never generate the initial migration against development or production.

```powershell
npm run build
npm run migration:run:prod
npm run migration:show:prod
```

After validating rollback consequences, the latest compiled migration can be reverted with:

```powershell
npm run migration:revert:prod
```

For destructive migrations, restore a verified backup instead of assuming `down` is a safe data rollback.

## Container deployment

Run migrations as a one-shot job before starting or replacing the API container:

```sh
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

Start the normal API only after that job exits successfully:

```sh
node dist/main.js
```

Do not add migration execution to the image entrypoint or application command. This avoids concurrent migration runners and makes failure visible to the deployment system.

## Health checks

- `GET /health/live` verifies only that the HTTP process responds.
- `GET /health/ready` verifies MySQL connectivity with `SELECT 1`.
- `GET /health` is an alias for readiness and is used by the Docker image.

The endpoints are public, excluded from audit persistence, and return no connection details.
