# Design

## Decisions

- Nest and the TypeORM CLI SHALL consume one connection-options factory.
- `synchronize` and `migrationsRun` SHALL remain disabled in every normal runtime environment.
- Production migrations SHALL run as compiled JavaScript in a separate deployment job.
- Readiness SHALL execute `SELECT 1`; liveness SHALL not access MySQL.
- Existing public routes SHALL remain unchanged and no global prefix SHALL be introduced.

## Deployment sequence

```mermaid
sequenceDiagram
  participant D as Deployment
  participant M as Migration job
  participant DB as MySQL 8
  participant API as Nest API
  D->>M: Start compiled migration job
  M->>DB: Apply pending migrations
  DB-->>M: Success
  M-->>D: Exit 0
  D->>API: Start node dist/main.js
  D->>API: GET /health
  API->>DB: SELECT 1
  DB-->>API: Ready
```
