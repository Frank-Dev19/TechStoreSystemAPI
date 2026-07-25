# Tasks

## 1. Infrastructure

- [x] 1.1 Allow inventory movements to participate in a caller transaction.
- [x] 1.2 Pass the sale transaction manager to all sale inventory writes.

## 2. Cancellation

- [x] 2.1 Reverse original stock movements idempotently.
- [x] 2.2 Reverse cash register aggregates and create trace entries.
- [x] 2.3 Deactivate links and recompute service-order economics.

## 3. Testing

- [x] 3.1 Cover transaction-manager propagation.
- [x] 3.2 Cover successful and repeated cancellation.
