# Proposal: Reliable WhatsApp template dispatch

## Objective

Reconnect order-intake notifications to the aggregate order-creation path and make every supported Meta template contract explicit and testable.

## Scope

- Dispatch the intake summary only after the aggregate order transaction commits.
- Use the single approved intake template for every service type.
- Align the intake body variables with client name, order code and equipment count.
- Keep provider failures observable and idempotent through the existing notification records and retry policy.
- Cover all active template builders with contract tests so later changes cannot silently reorder variables, documents or buttons.

## Rollback

Remove the aggregate post-commit hook and restore the previous two-variable intake template contract. Existing notification history remains readable.
