# Service-order economic workflow delta

## MODIFIED Requirements

### Requirement: Delivery Gating by Global Order Coverage

The backend MUST evaluate economic coverage at the service-order header. Any equipment delivery SHALL require full reconciliation or exemption of the current confirmed global agreement.

#### Scenario: Delivering one item after full order coverage

- **GIVEN** an order agreement covers several equipment items
- **AND** the entire order is fully reconciled
- **AND** one item is ready
- **WHEN** delivery is requested for that item
- **THEN** the backend MUST allow that item delivery
- **AND** sibling items MAY remain undelivered

#### Scenario: Rejecting partial delivery while order payment is incomplete

- **GIVEN** one item is ready
- **AND** the global order agreement is only partially reconciled
- **WHEN** delivery is requested for the ready item
- **THEN** the backend MUST reject the delivery
- **AND** it MUST NOT infer an economic allocation per item

## ADDED Requirements

### Requirement: Partial Delivery Projection

After global economic coverage is satisfied, item deliveries MAY occur independently and the order MUST expose a partial-delivery state until all non-cancelled items are delivered.

#### Scenario: First of two items is delivered

- **GIVEN** an order has two active items and full economic coverage
- **WHEN** the first item is delivered
- **THEN** that item MUST remain delivered
- **AND** the parent MUST indicate partial delivery

### Requirement: Billed Cancellation Requires Reversal

A cancellation that reduces a confirmed and billed agreement MUST NOT mutate an issued sale or its links in place.

#### Scenario: Cancellation affects a confirmed grouped sale

- **GIVEN** the order is part of a confirmed sale containing other orders
- **WHEN** a supervisor approves an item cancellation that reduces the amount
- **THEN** final financial cancellation MUST remain blocked until the sale is reversed
- **AND** the replacement sale MUST be generated from the new confirmed agreements
