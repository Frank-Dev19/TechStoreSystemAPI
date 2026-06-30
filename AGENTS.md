# AGENTS.md

## Trust These First
- `README.md` is still the default Nest starter; do not use it to infer repo behavior.
- Start with `package.json`, `jest.config.js`, `test/jest-e2e.json`, `tsconfig*.json`, `eslint.config.mjs`, `src/main.ts`, `src/app.module.ts`, `.env.example`, and `openspec/config.yaml`.

## Repo Shape
- Single NestJS 11 API. Real entrypoints are `src/main.ts` and `src/app.module.ts`.
- The codebase is domain-modular under `src/`, not layered by type. High-change areas are `service-orders/`, `inventory/`, `sales/`, `auth/`, `roles/`, and `audit/`.
- There is no global API prefix or versioning in `main.ts`; controller decorators define the public routes.
- Route naming is not uniform: inventory mixes `inventory/*` controllers with bare paths like `serials` and `lots`.

## Runtime Gotchas
- App startup is NOT side-effect free. `BootstrapService` runs on module init and syncs RBAC catalog data, default document types, admin grants, and default users.
- `PricingModule` seeds tax config on module init.
- `main.ts` enables `helmet`, `cookie-parser`, strict global validation, `rawBody: true`, and CORS from `CORS_ORIGINS`.
- Auth uses refresh cookies; `COOKIE_NAME` defaults to `rt`.
- Audit is global via `AuditModule`'s `APP_INTERCEPTOR`, so controller/service changes can create audit side effects.
- WhatsApp inbox behavior is env-driven under `src/service-orders/inbox/`; in production, webhook signature validation requires `WHATSAPP_CLOUD_APP_SECRET`.
- Service-order SLA policy reads many `SERVICE_ORDER_SLA_*` env vars with defaults in `service-order-stage-sla-policy.service.ts`.
- `Dockerfile` healthchecks `GET /health`, but the app currently only exposes `/` from `AppController`; do not assume a real health endpoint exists.

## Config And Persistence
- Env is loaded from the repo root via `ConfigModule.forRoot({ isGlobal: true })`.
- Local DB config uses `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_NAME`, with `synchronize: true` in non-production.
- Production expects `DATABASE_URL`; `DB_SSL=true` enables permissive SSL and production forces `synchronize: false`.
- Migrations exist under `src/database/migrations`, but there is no migration npm script wired in `package.json`.

## Commands That Matter
- Dev server: `npm run start:dev`
- Build: `npm run build`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Format: `npm run format`
- Unit/integration tests: `npm run test`
- Single Jest file: `npm run test -- --runTestsByPath src/path/to/file.spec.ts`
- E2E tests: `npm run test:e2e`
- Single e2e file: `npm run test:e2e -- --runTestsByPath test/path/to/file.e2e-spec.ts`

## Test And Tooling Quirks
- `npm run lint` runs ESLint with `--fix`; treat it as a mutating command.
- `npm run format` only formats `src/**/*.ts` and `test/**/*.ts`.
- Unit/integration Jest only picks up `src/**/*.spec.ts`; e2e uses `test/jest-e2e.json` and `*.e2e-spec.ts`.
- Tests run through `ts-jest` with `tsconfig.spec.json`, which switches the compiler from app `nodenext` to `commonjs`.

## Spec Workflow
- `openspec/config.yaml` is active and `strict_tdd: true` is enabled.
- Before non-trivial feature work, check `openspec/specs/` and any active change under `openspec/changes/`.
- Parent workspace docs in `../docs/*.md` are coordination notes only; backend executable specs/tasks belong in this repo's `openspec/` tree.
