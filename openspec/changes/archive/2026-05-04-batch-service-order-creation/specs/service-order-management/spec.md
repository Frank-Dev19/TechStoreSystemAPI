# batch-service-order-creation Specification (API)

## Purpose

Definir el contrato y comportamiento backend para crear múltiples órdenes de servicio individuales en una sola operación.

## Requirements

### Requirement: Explicit Batch Create Contract

The service-order backend MUST expose an explicit contract for batch creation and SHALL accept shared context plus many order-specific entries.

#### Scenario: Creating many service orders through one request
- GIVEN a batch create request contains shared intake context and many order entries
- WHEN the backend processes the request
- THEN it MUST create one independent service order per entry
- AND it MUST return the created orders individually

### Requirement: Shared Context Reuse with Per-Order Independence

The backend MUST reuse the shared context for each created order and SHALL still preserve per-order identity, snapshots, and state.

#### Scenario: Applying shared context to every created order
- GIVEN a batch create request contains one shared client and reception context
- WHEN the backend creates many service orders
- THEN each created order MUST inherit that context
- AND each one MUST receive its own identity, code, and lifecycle fields

### Requirement: No Grouped Order Entity

The backend MUST NOT collapse the batch into one grouped service order and SHALL preserve the same domain semantics used by single-order creation.

#### Scenario: Preserving individual order semantics
- GIVEN many order entries are created from one request
- WHEN persistence completes
- THEN the system MUST store them as independent service orders
- AND downstream features such as agreements, diagnosis, billing, and delivery MUST continue working per order

### Requirement: Consistent Batch Outcome

The backend MUST define a consistent outcome for batch creation and SHALL NOT leave the receptionist with an ambiguous result set.

#### Scenario: Returning created orders consistently
- GIVEN the batch create operation finishes successfully
- WHEN the backend returns the result
- THEN the response MUST identify every created order
- AND the caller MUST be able to map each created order back to its submitted candidate entry
