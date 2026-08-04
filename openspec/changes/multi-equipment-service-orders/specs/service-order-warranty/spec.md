# Service-order warranty lookup specification

## ADDED Requirements

### Requirement: Exact Warranty Lookup by Equipment Serial

The backend MUST support exact normalized lookup of historical service-order items by equipment serial and SHALL return candidates ordered by the most recent delivery or completion.

#### Scenario: One historical equipment item matches

- **GIVEN** an operator enters a serial that matches one historical item
- **WHEN** warranty lookup runs
- **THEN** the API MUST return that item, its parent order, client, contact, and equipment snapshot
- **AND** the UI MAY prefill the new warranty intake from it

#### Scenario: Several historical items match

- **GIVEN** the same serial occurs in several historical items
- **WHEN** warranty lookup runs
- **THEN** the API MUST return the candidates without choosing silently
- **AND** the operator MUST be able to select the intended source

#### Scenario: No historical item matches

- **GIVEN** no item matches the serial
- **WHEN** the operator continues
- **THEN** manual warranty intake MUST remain available
- **AND** `warrantySourceItemId` MAY remain null

### Requirement: Warranty Source Does Not Decide Coverage

Finding a source item MUST NOT automatically approve or reject warranty coverage. The assigned technician SHALL record the outcome through the warranty diagnosis.

#### Scenario: Source is outside the displayed coverage period

- **GIVEN** a source item is found but its displayed coverage period has elapsed
- **WHEN** the warranty order is created
- **THEN** the system MAY warn that it appears outside the period
- **AND** it MUST NOT block creation or force a rejection outcome

### Requirement: Warranty Reference Is Optional and Traceable

A warranty item MAY reference one historical source item. The relationship MUST be queryable and SHALL use `SET NULL` semantics if the source is permanently removed.

#### Scenario: Creating from a selected source

- **GIVEN** reception selects a historical source candidate
- **WHEN** the warranty order is created
- **THEN** the new item MUST store `warrantySourceItemId`
- **AND** it MUST retain its own immutable intake snapshot
