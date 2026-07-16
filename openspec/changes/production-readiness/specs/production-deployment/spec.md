# Production deployment specification

## Requirement: Versioned schema lifecycle

The application MUST manage the production schema with compiled TypeORM migrations and MUST NOT synchronize the schema automatically.

### Scenario: Empty production database

- **Given** an empty MySQL 8 database
- **When** the compiled migration job runs
- **Then** it MUST create the complete schema and record the migration in `typeorm_migrations`

### Scenario: Repeated migration job

- **Given** all migrations are already applied
- **When** the migration job runs again
- **Then** it MUST succeed without changing the schema

### Scenario: Normal application startup

- **Given** `NODE_ENV=production`
- **When** the API starts normally
- **Then** it MUST use `synchronize: false`, MUST use `migrationsRun: false`, and MUST NOT execute migrations

## Requirement: Container health probes

### Scenario: Liveness

- **Given** the Nest process is serving HTTP
- **When** an unauthenticated client requests `GET /health/live`
- **Then** it MUST return HTTP 200 without querying MySQL

### Scenario: Readiness

- **Given** MySQL responds to `SELECT 1`
- **When** an unauthenticated client requests `GET /health/ready` or `GET /health`
- **Then** it MUST return HTTP 200 with a non-sensitive response

### Scenario: Database unavailable

- **Given** MySQL does not respond
- **When** a client requests a readiness endpoint
- **Then** it MUST return HTTP 503 without exposing the driver error
