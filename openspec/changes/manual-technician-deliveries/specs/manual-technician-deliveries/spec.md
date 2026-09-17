# Manual technician deliveries

## ADDED Requirements

### Requirement: Manual supply issue

An inventory manager MUST be able to select an active technician, catalog products and quantities and confirm one internal delivery. Confirmation MUST atomically create the delivery, immutable lines and one inventory OUT per physical stock line. It MUST NOT create or change a quote, reconciliation or sale.

#### Scenario: Consumable retained by technician

- GIVEN ten available grams of thermal paste
- WHEN inventory delivers four grams manually to a technician
- THEN warehouse stock decreases by four and the delivery remains attributed to that technician without a service order.

#### Scenario: Retry and concurrent stock

- GIVEN a manual delivery request key
- WHEN the same request is retried
- THEN it MUST return the original result without a second movement.

### Requirement: Unified register

The register MUST contain order-backed and manual deliveries and MUST filter by technician, inclusive date range and origin. Order rows retain their order link; manual rows explicitly state that they have no commercial origin.
