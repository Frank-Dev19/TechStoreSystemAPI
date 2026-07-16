# Tasks

## 1. Infrastructure

- [x] 1.1 Add shared TypeORM options and CLI DataSource.
- [x] 1.2 Add an initial migration generated from an empty MySQL 8 database.
- [x] 1.3 Add local and compiled production migration scripts.

## 2. Implementation

- [x] 2.1 Add liveness and readiness endpoints.
- [x] 2.2 Validate production database configuration early.
- [x] 2.3 Verify migration artifacts in the Docker build.
- [x] 2.4 Document production operations.

## 3. Testing

- [x] 3.1 Test shared TypeORM invariants.
- [x] 3.2 Test public health behavior and database failures.
- [x] 3.3 Apply, reapply, revert, and rebuild the schema on temporary MySQL 8.
- [x] 3.4 Run build, typecheck, scoped lint, unit, health e2e, and image validation. The pre-existing full lint and legacy e2e failures are documented in the verification handoff.
