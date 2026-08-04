# Service-order aggregate delta

## MODIFIED Requirements

### Requirement: Aggregate Creation Contract

The service-order backend MUST expose one creation contract containing shared order context and one or more equipment items. One accepted request SHALL create exactly one service order regardless of item count.

#### Scenario: Creating an order with many equipment items

- **GIVEN** a creation request contains one client, one technician, one service type, and three equipment items
- **WHEN** the backend accepts the request
- **THEN** it MUST create one service order header
- **AND** it MUST create three child items belonging to that header
- **AND** it MUST NOT create three independent service orders

#### Scenario: Creating an order with one equipment item

- **GIVEN** a creation request contains one equipment item
- **WHEN** the backend accepts the request
- **THEN** it MUST use the same aggregate contract
- **AND** it MUST create one header and one child item

### Requirement: Shared Context and Per-Item Data

The backend MUST keep client, contact, assigned technician, request origin, and service type on the order header. Equipment data, priority, estimates, notes, and lifecycle state SHALL belong to each item.

#### Scenario: Rejecting mixed service types

- **GIVEN** one creation request attempts to submit different service types for sibling items
- **WHEN** the backend validates the request
- **THEN** it MUST reject the request
- **AND** it MUST NOT persist a partial order

#### Scenario: Defaulting item priority

- **GIVEN** an equipment item omits priority
- **WHEN** the backend creates the item
- **THEN** its priority MUST be `LOW`

### Requirement: Immutable Service Type

The service type MUST be selected once for the whole order and SHALL NOT be editable after creation.

#### Scenario: Attempting to change service type

- **GIVEN** an existing order has service type `DIAGNOSIS`
- **WHEN** an authorized operator attempts to update it to `STANDARD_SERVICE`
- **THEN** the backend MUST reject the change

### Requirement: Atomic Aggregate Creation

Order header, equipment items, codes, initial commercial data, initial events, and aggregate projection MUST be persisted in one transaction.

#### Scenario: One child write fails

- **GIVEN** a request contains multiple valid-looking items
- **WHEN** persistence of any item or initial commercial line fails
- **THEN** the entire transaction MUST roll back
- **AND** no header, child, event, or partial agreement may remain

## ADDED Requirements

### Requirement: Readable Daily Codes

The backend MUST allocate service-order codes from a concurrency-safe daily sequence using the `America/Lima` business date.

#### Scenario: Allocating parent and child codes

- **GIVEN** the next daily sequence for 2 August 2026 is one
- **WHEN** an order with two items is created
- **THEN** the parent code MUST be `SO-02-08-2026-0001`
- **AND** child codes MUST be `SO-02-08-2026-0001-01` and `SO-02-08-2026-0001-02`

#### Scenario: Concurrent creations

- **GIVEN** two requests create orders concurrently on the same Lima business date
- **WHEN** both transactions allocate a sequence
- **THEN** they MUST receive different parent codes

### Requirement: Single Reception Document

The backend MUST generate one reception summary PDF per order and SHALL include every active equipment item in item-code order.

#### Scenario: Downloading a multi-equipment reception PDF

- **GIVEN** an order contains three equipment items
- **WHEN** an authorized operator requests its reception summary
- **THEN** the response MUST contain one PDF
- **AND** that PDF MUST identify the parent order and all three child codes
