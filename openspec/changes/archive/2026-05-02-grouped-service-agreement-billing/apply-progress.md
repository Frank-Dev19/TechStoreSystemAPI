# Apply Progress: grouped-service-agreement-billing (API)

## Completed in this batch
- Fixed TypeORM column metadata for the new billing snapshot fields in `sale.entity.ts` by making every snapshot column explicit `varchar`.
- Added focused tests in `sales.service.spec.ts` for grouped billing from multiple orders of the same operational client.
- Covered grouped billing rejection when selected orders belong to different operational clients.
- Covered fiscal snapshot persistence and taxpayer validation through the grouped billing path.
- Added delivery-gating test in `service-order.service.spec.ts` to block delivery until the current agreement is fully covered.
- Re-ran focused verification:
  - `npm test -- --runInBand src/sales/services/sales.service.spec.ts` ✅
  - `npm test -- --runInBand src/sales/services/sales.service.spec.ts src/service-orders/services/service-order.service.spec.ts` ✅
  - `npx tsc --noEmit` ✅

## Remaining
- Verify the new sale snapshot columns against the real persistence/migration path if the project still requires explicit DDL synchronization outside this change.
