# Design

Inventory movement creation accepts an optional TypeORM `EntityManager`. Sale workflows pass their active query-runner manager, preventing nested independent commits.

Cancellation locks the sale, creates inverse inventory movements from the original sale movements, records inverse cash entries, updates the register aggregates, soft-deletes billing links, recomputes linked order economics, and finally marks the sale cancelled before committing.
