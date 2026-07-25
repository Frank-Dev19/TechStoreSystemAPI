# Proposal: Service-order action permissions

## Why

A single `service-order.update` permission currently authorizes unrelated actions such as editing, assignment, technical transitions, delivery, and billing links.

## What changes

- Introduce action-specific permissions for those operations.
- Align receptionist, technician, and supervisor default grants with their existing panels.
- Keep sales, cash, and inventory authorization unchanged.

## Rollback

Restore the route decorators to `service-order.update` and remove the new default grants.
