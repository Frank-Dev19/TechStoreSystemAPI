# Tasks: batch-service-order-creation (API)

## Phase 1 — Batch contract and service foundation
- [x] 1.1 Add explicit batch DTOs for shared context + order entries
- [x] 1.2 Expose `POST /service-orders/batch`
- [x] 1.3 Implement `ServiceOrderService.createBatch(...)` reusing single-order create rules
- [x] 1.4 Return created orders individually for traceability

## Phase 2 — Backend tests and consistency
- [x] 2.1 Add service tests for batch success path
- [x] 2.2 Add validation test for empty batch or missing entries
- [x] 2.3 Add controller test for batch delegation and auth user requirement
- [x] 2.4 Review consistency/atomicity behavior and tighten if needed

## Phase 3 — Verification artifacts
- [x] 3.1 Create/update apply-progress with implemented backend scope
- [x] 3.2 Re-run focused backend tests and type-check for batch flow
