# Production readiness

## Why

Production requires a repeatable MySQL 8 schema lifecycle and health probes that do not rely on TypeORM synchronization or application startup side effects.

## What changes

- Add a shared TypeORM configuration and CLI DataSource with versioned migrations.
- Add public liveness and readiness endpoints.
- Add production migration scripts, container artifact checks, and operational documentation.

## Rollback

Revert the application changes and use the reviewed `down` migration only when data-loss implications are accepted. Production database recovery SHOULD prefer a verified backup for destructive changes.
