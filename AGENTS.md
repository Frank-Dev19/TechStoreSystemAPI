# AGENTS.md

## Trust These Sources First
- `README.md` is still the default Nest starter and does not describe this codebase.
- Prefer `package.json`, `jest.config.js`, `tsconfig*.json`, `eslint.config.mjs`, `src/main.ts`, `src/app.module.ts`, and `openspec/config.yaml`.

## Repo Shape
- Single NestJS 11 API in `src/`; main entrypoints are `src/main.ts` and `src/app.module.ts`.
- The app is domain-modular, not layered by type. High-traffic areas are `auth/`, `service-orders/`, `sales/`, `inventory/`, `pricing/`, `roles/`, and `audit/`.
- There is no global API prefix or versioning in `main.ts`; controller paths are the real public routes.
- Route naming is not fully uniform: some inventory endpoints live under `inventory/*`, while others are bare paths like `serials` and `lots`.

## Startup Side Effects
- `BootstrapService` runs on module init and continuously syncs RBAC catalog data, default document types, admin grants, and default users. Do not treat startup as side-effect free.
- `PricingModule` seeds tax config on module init.

## Config And Persistence
- `ConfigModule.forRoot({ isGlobal: true })` loads env directly from the repo root.
- Local DB uses discrete MySQL vars (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`) and `synchronize: true` in `src/app.module.ts`.
- Production uses `DATABASE_URL`, optional `DB_SSL=true`, and `synchronize: false`.
- Migrations exist in `src/database/migrations`, but there is no npm migration script wired in `package.json`.

## Verification Commands
- Dev server: `npm run start:dev`
- Typecheck: `npx tsc --noEmit`
- Unit/integration tests: `npm run test`
- Single Jest file: `npm run test -- --runTestsByPath src/path/to/file.spec.ts`
- E2E tests: `npm run test:e2e`
- Single e2e file: `npm run test:e2e -- --runTestsByPath test/path/to/file.e2e-spec.ts`
- Coverage: `npm run test:cov`
- Lint: `npm run lint`
- Format: `npm run format`

## Testing/Lint Gotchas
- `jest.config.js` only picks up `src/**/*.spec.ts`; e2e uses `test/jest-e2e.json` and `*.e2e-spec.ts`.
- `npm run lint` runs ESLint with `--fix`; it WILL modify files.
- Tests run with `ts-jest` using `tsconfig.spec.json`, which switches modules to CommonJS even though the app tsconfig uses `nodenext`.

## Runtime Behavior Worth Remembering
- `main.ts` enables `helmet`, `cookie-parser`, strict global validation, and CORS from `CORS_ORIGINS`.
- Auth relies on refresh cookies (`COOKIE_NAME`, default `rt`) plus JWT secrets from env.
- Audit is global through `AuditModule`'s `APP_INTERCEPTOR`; changes to controllers/services can have audit side effects.
- WhatsApp inbox integration under `src/service-orders/inbox/` is env-driven; in production it requires `WHATSAPP_CLOUD_APP_SECRET` for webhook signature validation.
- Service-order SLA targets come from `SERVICE_ORDER_SLA_*` env vars with built-in defaults in `service-order-stage-sla-policy.service.ts`.

## Spec Workflow
- `openspec/config.yaml` is active and marks the repo as `strict_tdd: true`.
- Check `openspec/specs/` and any active folder under `openspec/changes/` before making non-trivial feature changes.

## Workspace Coordination
- Parent workspace docs live in `../docs/*.md` and are coordination notes only; they are not the authoritative home for API specs or tasks.
- For backend-only work, the SDD artifact must live in this repo's `openspec/` tree.
- For APP + API changes, keep lightweight coordination in `../docs/`, but maintain executable proposal/spec/design/tasks separately inside each affected repo.
