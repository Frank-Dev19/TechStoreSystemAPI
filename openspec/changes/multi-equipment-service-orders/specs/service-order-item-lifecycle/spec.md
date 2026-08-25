# Service-order item lifecycle specification

## ADDED Requirements

### Requirement: Independent Equipment Lifecycle

Each equipment item MUST own its technical, commercial, operative, completion, cancellation, and delivery state. Sibling changes SHALL NOT overwrite an item's state.

#### Scenario: Completing one of several items

- **GIVEN** an order has two active items in execution
- **WHEN** the assigned technician resolves the first item
- **THEN** the first item MUST become resolved
- **AND** the second item MUST remain in execution
- **AND** the order MUST expose a partial aggregate state

### Requirement: Common Technician Assignment

The assigned technician MUST belong to the order header and SHALL apply to every active item. The API MUST NOT support an item-level technician override.

#### Scenario: Reassigning an order

- **GIVEN** an order contains multiple items assigned to technician A
- **WHEN** reception or supervision reassigns the order to technician B
- **THEN** every active item MUST be visible as assigned to technician B
- **AND** no item MAY retain technician A as its own assignment

### Requirement: Execution Gate by Global Commercial Acceptance

No active item MUST enter execution until every non-cancelled item requiring commercial approval has an accepted current commercial version.

#### Scenario: One sibling still requests changes

- **GIVEN** item one is accepted and item two has requested changes
- **WHEN** an operator attempts to start item one
- **THEN** the backend MUST reject the transition

#### Scenario: All active items accepted

- **GIVEN** every non-cancelled item has an accepted current version
- **WHEN** the assigned technician starts one item
- **THEN** the transition MAY proceed

### Requirement: Item Cancellation Before Execution

Reception, the assigned technician, supervision, or administration MAY cancel an item before execution when authorized by `service-order.item-cancel`. The action MUST record actor, channel, reason, and time.

#### Scenario: Client cancels through WhatsApp before work starts

- **GIVEN** an item has not entered execution
- **WHEN** an authorized operator records the client's cancellation from WhatsApp
- **THEN** the cancellation request MUST be created and approved atomically
- **AND** the item MUST become cancelled
- **AND** active commercial totals MUST exclude it or include only an accepted cancellation charge

### Requirement: Supervised Cancellation After Execution Starts

An item cancellation requested after execution starts MUST remain pending until a user with `service-order.item-cancel-after-start` resolves it.

#### Scenario: Technician records a late cancellation request

- **GIVEN** an item is in execution
- **WHEN** the assigned technician records the client's request
- **THEN** the item MUST enter a cancellation-requested state
- **AND** it MUST NOT become cancelled immediately

#### Scenario: Supervisor approves with a charge

- **GIVEN** an execution-stage cancellation is pending
- **WHEN** a supervisor approves it with a charge for completed work
- **THEN** the backend MUST create a new commercial adjustment version
- **AND** the charge MUST require a recorded client decision
- **AND** the cancellation MUST NOT be financially final until that decision is accepted

#### Scenario: Supervisor rejects cancellation

- **GIVEN** an execution-stage cancellation is pending
- **WHEN** a supervisor rejects it with a reason
- **THEN** the request MUST be marked rejected
- **AND** the item MUST return to its prior actionable state

### Requirement: Aggregate Projection Is Transactional

Every item lifecycle mutation MUST lock the order and recalculate the parent projection in the same transaction.

#### Scenario: Projection persistence fails

- **GIVEN** an item transition is being persisted
- **WHEN** recalculating or saving the aggregate projection fails
- **THEN** the item transition and all local side effects MUST roll back

### Requirement: Terminal Operative States Block Technical Transitions

Technical transitions MUST only be accepted while an item is operatively `ABIERTA` or `EN_PROCESO`. An item pending cancellation, cancelled, ready for pickup, delivered, or closed without solution MUST remain read-only for technical workflow transitions.

#### Scenario: Direct API call attempts to reactivate a cancelled item

- **GIVEN** an item is operatively cancelled but retains an earlier technical status
- **WHEN** a caller requests a new technical transition for that item
- **THEN** the backend MUST reject the transition inside the locked transaction
- **AND** it MUST NOT persist an item change, event, or aggregate projection

### Requirement: Repair Does Not Require Part Assignment

The service-order workflow MUST NOT require linking inventory products, lots, or serial numbers to an equipment item in order to start, complete, or deliver a repair.

#### Scenario: Technician completes work without recording parts

- **GIVEN** the assigned technician used warehouse material outside the service-order workflow
- **WHEN** the technician completes the equipment item without registering used-part identifiers
- **THEN** the lifecycle transition MUST remain available
- **AND** the system MUST NOT claim which inventory part was used in that repair
