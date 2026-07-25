# Proposal: Atomic sale lifecycle

## Why

Inventory movements currently commit in a transaction independent from the sale. Cancellation only changes the sale status, leaving stock, cash, payments, and service-order reconciliation inconsistent.

## What changes

- Reuse the sale transaction for inventory movements.
- Reverse stock and cash effects when a confirmed sale is cancelled.
- Remove active service-order links and recompute their economic state.
- Make repeated cancellation idempotent.

## Rollback

Revert the transaction-manager plumbing and cancellation workflow. No authorization decorators are changed.
