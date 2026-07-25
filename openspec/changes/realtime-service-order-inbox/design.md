# Design

The API uses an in-process RxJS publisher and a Nest SSE endpoint. Events are intentionally content-free invalidations. On receipt, the frontend reloads the already-authorized thread list and, when applicable, the selected conversation.

This implementation covers a single API process. A future multi-replica deployment must replace the publisher transport with a shared broker while retaining the same event contract.

```mermaid
sequenceDiagram
  participant Meta
  participant API
  participant SSE
  participant UI
  Meta->>API: WhatsApp webhook
  API->>API: Persist message
  API->>SSE: inbox.changed
  SSE-->>UI: invalidation only
  UI->>API: GET authorized messages
  API-->>UI: selected conversation
```
