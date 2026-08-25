# Design

The cancellation transaction remains the source of truth. PDF generation and WhatsApp delivery execute only after commit, so an integration failure cannot roll back the operational or commercial state.

```mermaid
sequenceDiagram
  participant O as Operator
  participant C as Cancellation service
  participant DB as MySQL
  participant P as PDF service
  participant W as WhatsApp/Meta
  O->>C: Cancel selected items
  C->>DB: Transaction: requests, charges, states, events
  DB-->>C: Commit
  C->>P: Generate consolidated summary
  P-->>C: Temporary PDF
  C->>W: Utility template + PDF
  W-->>C: Delivery result stored
```

The idempotency key uses the sorted cancellation-request IDs. This identifies the exact operator operation while allowing another later cancellation for the same order.
