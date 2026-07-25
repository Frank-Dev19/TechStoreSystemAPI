# Proposal: Atomic service-order operations

## Why

Diagnosis, assignment, status, balance, and event writes can currently commit independently and race when two operators act on the same order.

## What changes

- Lock the order during diagnosis, assignment, and technical transition writes.
- Persist each operation's order, balance, diagnosis, commercial status, and event changes in one transaction.
- Dispatch external notifications only after a successful commit.

## Rollback

Restore the previous repository calls. No route authorization changes are part of this change.
