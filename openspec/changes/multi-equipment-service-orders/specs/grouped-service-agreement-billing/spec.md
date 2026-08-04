# Grouped service agreement billing delta

## MODIFIED Requirements

### Requirement: Grouped Service Agreement Billing Contract

The backend MUST accept many confirmed order-level agreements from the same operational client and SHALL create one sale for the grouped selection. Each selected agreement MUST represent the current accepted equipment-version set of its order.

#### Scenario: Creating one sale from several order agreements

- **GIVEN** several current agreements belong to the same operational client
- **WHEN** grouped billing succeeds
- **THEN** the backend MUST create one sale
- **AND** it MUST link the sale to every selected order agreement

#### Scenario: Rejecting a stale agreement revision

- **GIVEN** a selected agreement has been superseded by a newer revision
- **WHEN** grouped billing is requested
- **THEN** the backend MUST reject the request

### Requirement: Traceable Lines Per Equipment Commercial Content

The backend MUST preserve order and equipment traceability in sale-item snapshots. Repeated products or services from different equipment items SHALL NOT be merged solely because their catalog identity matches.

#### Scenario: Billing one agreement containing several equipment items

- **GIVEN** a confirmed agreement contains commercial lines for two equipment items
- **WHEN** the sale is created
- **THEN** stored sale lines MUST identify the parent order code and corresponding equipment code
- **AND** lines from sibling equipment MUST remain distinguishable

### Requirement: Accepted Discounts Are Preserved

Billing MUST use the base price, discount snapshots, and net totals from the confirmed agreement. It MUST NOT recalculate discounts from the current pricing configuration.

#### Scenario: Pricing configuration changed after acceptance

- **GIVEN** an agreement was accepted with an allowed discount
- **AND** the maximum discount configuration changed afterward
- **WHEN** the agreement is billed
- **THEN** the sale MUST preserve the accepted monetary snapshot
