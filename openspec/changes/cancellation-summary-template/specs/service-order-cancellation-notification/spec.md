# Service-order cancellation notification

## Requirement: Consolidated cancellation summary

The system MUST send at most one utility-template notification for every successful cancellation operation and MUST attach a PDF containing all items selected in that operation.

### Scenario: Mixed cancellation results

- **Given** an operator cancels multiple items and only some have a diagnostic charge
- **When** the cancellation transaction commits
- **Then** the system MUST create one PDF listing every selected item and its applicable amount
- **And** the system MUST send one `resumen_cancelacion_equipos` template with that PDF

### Scenario: Delivery integration fails

- **Given** the cancellation transaction committed
- **When** PDF preparation or WhatsApp delivery fails
- **Then** the system MUST preserve the committed cancellation
- **And** it MUST record or log the delivery failure without throwing it to the operator

### Scenario: Duplicate dispatch

- **Given** the same cancellation-request IDs were already notified
- **When** dispatch is attempted again
- **Then** the system MUST NOT create a duplicate notification
