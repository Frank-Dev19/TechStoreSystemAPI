# Internal delivery flow

## Requirements

### Requirement: Quote-backed delivery follows service execution

The system SHALL allow products from an accepted quote to leave inventory only when the corresponding equipment is in `EN_EJECUCION`.

#### Scenario: Delivery before service starts

- **WHEN** an operator attempts to deliver a quoted product before the equipment is in service
- **THEN** the API rejects the operation without changing stock

### Requirement: Material confirmation gates completion

The system SHALL prevent transition to `RESUELTA` when the accepted quote contains products and its current material reconciliation is missing, stale, or inconsistent.

#### Scenario: Complete confirmed delivery

- **WHEN** every quoted product is represented by an outstanding delivery and the reconciliation matches the accepted version
- **THEN** the equipment may transition to `RESUELTA`

### Requirement: Manual supplies may reference an order

The system SHALL allow an independent technician supply to store an optional service-order reference. If the order already has an assigned technician, that technician SHALL match the recipient.

#### Scenario: Supply without a quote

- **WHEN** inventory delivers a consumable to a technician and optionally selects a compatible order
- **THEN** the system records the output as an internal technician delivery and preserves the optional order link
