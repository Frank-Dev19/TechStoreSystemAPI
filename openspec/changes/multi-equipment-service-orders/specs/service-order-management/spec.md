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

The order header MUST NOT persist, accept, expose, filter, or calculate a priority. Priority SHALL exist only on each equipment item.

#### Scenario: Rejecting mixed service types

- **GIVEN** one creation request attempts to submit different service types for sibling items
- **WHEN** the backend validates the request
- **THEN** it MUST reject the request
- **AND** it MUST NOT persist a partial order

#### Scenario: Defaulting item priority

- **GIVEN** an equipment item omits priority
- **WHEN** the backend creates the item
- **THEN** its priority MUST be `LOW`

#### Scenario: Preserving assigned technician in projected responses

- **GIVEN** an order has an assigned technician
- **WHEN** an item transition recalculates and returns the aggregate
- **THEN** the response MUST preserve `assignedToTechnicianId`
- **AND** it MUST include the assigned technician relation and display name
- **AND** it MUST NOT execute assignment suggestions or alter technician workload balances

#### Scenario: Listing orders without header priority
- **GIVEN** an order contains equipment items with different priorities
- **WHEN** the backend returns the order list or detail
- **THEN** the header MUST NOT expose a priority field
- **AND** every item MUST expose its own priority

#### Scenario: No order priority filtering
- **GIVEN** equipment items retain individual priorities
- **WHEN** a user lists service orders
- **THEN** the API MUST NOT accept a header priority filter

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

### Requirement: Atomic Multi-Item Cancellation

The backend MUST accept one or more equipment identifiers from the same order with a shared channel and reason. Equipment in `ASIGNADA` SHALL be cancelled without charge. Equipment at or beyond `EN_DIAGNOSTICO` SHALL be cancelled immediately with a fixed S/ 20 technical-service charge per item.

#### Scenario: Cancelling assigned and diagnosed equipment together

- **GIVEN** an operator selects one assigned equipment item and two items whose diagnosis has started
- **WHEN** the operator confirms the customer was informed and submits the cancellation
- **THEN** all three items MUST become cancelled in one transaction
- **AND** the assigned item MUST have no charge
- **AND** each diagnosed item MUST have an accepted S/ 20 commercial version
- **AND** one confirmed agreement MUST consolidate a total pending amount of S/ 40

#### Scenario: Missing charge acknowledgement

- **GIVEN** at least one selected equipment item has reached `EN_DIAGNOSTICO`
- **WHEN** the cancellation omits customer charge acknowledgement
- **THEN** the backend MUST reject the whole operation
- **AND** no selected item, request, commercial version, line, agreement, or event may be persisted

#### Scenario: One selected item is not cancellable

- **GIVEN** a multi-item selection contains a delivered, already cancelled, closed, or cancellation-pending item
- **WHEN** the cancellation is submitted
- **THEN** the backend MUST reject the whole operation without partial changes

### Requirement: Physical Return After Cancellation

Cancelling technical service MUST NOT imply that the equipment was physically returned. A cancelled item SHALL remain eligible for an explicit, auditable delivery. Cancellation without charge MAY be delivered immediately; cancellation with a diagnosis charge SHALL require full economic coverage or exemption before delivery.

#### Scenario: Delivering an early cancellation without charge

- **GIVEN** an assigned equipment item was cancelled without charge and has not been delivered
- **WHEN** an authorized operator records its delivery
- **THEN** the backend MUST set its delivery timestamp and record the delivery event
- **AND** it MUST preserve the item's operative status as `CANCELADA`
- **AND** it MUST NOT require a commercial agreement or payment

#### Scenario: Delivering a diagnosed cancellation after payment

- **GIVEN** a cancelled equipment item generated the fixed diagnosis charge
- **WHEN** the order has total economic coverage or an exemption and an authorized operator records delivery
- **THEN** the backend MUST set its delivery timestamp and preserve `CANCELADA`

#### Scenario: Blocking return while a cancellation charge is pending

- **GIVEN** a cancelled equipment item generated the fixed diagnosis charge and the order remains economically pending or partial
- **WHEN** delivery is requested
- **THEN** the backend MUST reject delivery without changing the item

### Requirement: Atomic Multi-Item Delivery

The backend MUST accept one or more equipment identifiers from the same order and SHALL deliver the selection in one transaction. It MUST validate the complete selection before persisting the first delivery.

#### Scenario: Delivering several eligible equipment items

- **GIVEN** an authorized operator selects several ready or economically enabled cancelled items from one order
- **WHEN** the delivery is confirmed
- **THEN** every selected item MUST receive the same delivery timestamp
- **AND** one delivery event MUST be recorded per newly delivered item
- **AND** the aggregate MUST be projected once after all writes

#### Scenario: One selected item becomes ineligible

- **GIVEN** a multi-item delivery includes an item that is neither ready nor an eligible cancellation
- **WHEN** the backend validates the locked selection
- **THEN** the entire operation MUST fail without delivery timestamps or events

#### Scenario: Retrying a partially completed request

- **GIVEN** one selected item already has a delivery timestamp and another remains eligible
- **WHEN** the same selection is submitted
- **THEN** the delivered item MUST be an idempotent no-op
- **AND** the remaining item MUST be delivered without duplicating the first event

#### Scenario: Sending the survey after physical completion

- **GIVEN** an order contains at least one non-cancelled item and every physical item has now been delivered
- **WHEN** the transaction commits
- **THEN** the survey notification MUST be requested once
- **AND** a fully cancelled order MUST NOT request a survey
